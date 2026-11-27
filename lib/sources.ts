import { clip, collapse, decodeEntities, overlapRatio, searchTerms } from "./text";
import type { SourceDoc, SourceKind } from "./types";

const UA = "ShodhSabha/0.1 (research council demo; +https://github.com)";

type GatherNotes = { notes: string[] };

async function fetchText(url: string, timeoutMs = 14000): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, application/atom+xml, text/html, */*",
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`${response.status} from ${new URL(url).host}`);
  }
  return response.text();
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? collapse(decodeEntities(match[1])) : "";
}

export function parseArxiv(xml: string): SourceDoc[] {
  const entries = xml.split("<entry>").slice(1);
  const docs: SourceDoc[] = [];
  entries.forEach((entry, index) => {
    const title = tag(entry, "title");
    const summary = tag(entry, "summary");
    const id = tag(entry, "id");
    const published = tag(entry, "published").slice(0, 4);
    if (!title || !id) return;
    docs.push({
      id: `ax${index + 1}`,
      kind: "arxiv",
      title,
      url: id,
      excerpt: clip(summary, 420),
      text: summary,
      year: published || undefined,
    });
  });
  return docs;
}

export async function searchArxiv(question: string): Promise<SourceDoc[]> {
  const terms = searchTerms(question).split(" ").filter(Boolean).slice(0, 4);
  const query = terms.map((term) => `all:${encodeURIComponent(term)}`).join("+AND+");
  const url =
    `https://export.arxiv.org/api/query?search_query=${query}` +
    `&start=0&max_results=3&sortBy=relevance`;
  let xml = await fetchText(url, 20000);
  if (/rate exceeded/i.test(xml)) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    xml = await fetchText(url, 20000);
  }
  if (/rate exceeded/i.test(xml)) throw new Error("arXiv rate limit");
  return parseArxiv(xml);
}

function reconstructAbstract(index: Record<string, number[]> | undefined): string {
  if (!index) return "";
  const pairs: [number, string][] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) pairs.push([position, word]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  return pairs.map((pair) => pair[1]).join(" ");
}

export async function searchOpenAlex(question: string): Promise<SourceDoc[]> {
  const terms = encodeURIComponent(searchTerms(question));
  const key = process.env.OPENALEX_API_KEY
    ? `&api_key=${encodeURIComponent(process.env.OPENALEX_API_KEY)}`
    : "";
  const url =
    `https://api.openalex.org/works?search=${terms}&per-page=3` +
    `&select=id,display_name,publication_year,doi,abstract_inverted_index` +
    `&mailto=shodhsabha-demo@example.com${key}`;
  const payload = JSON.parse(await fetchText(url)) as {
    results?: {
      id?: string;
      display_name?: string;
      publication_year?: number;
      doi?: string | null;
      abstract_inverted_index?: Record<string, number[]>;
    }[];
  };
  const docs: SourceDoc[] = [];
  (payload.results ?? []).forEach((work, index) => {
    const title = collapse(work.display_name ?? "");
    const abstract = reconstructAbstract(work.abstract_inverted_index);
    const url = work.doi || work.id || "";
    if (!title || !url) return;
    docs.push({
      id: `oa${index + 1}`,
      kind: "openalex",
      title,
      url,
      excerpt: clip(abstract || title, 420),
      text: abstract || title,
      year: work.publication_year ? String(work.publication_year) : undefined,
    });
  });
  return docs;
}

function wikiQueries(question: string): string[] {
  const terms = searchTerms(question);
  const names = question.match(/\b[A-Z][a-z]{3,}\b/g) ?? [];
  const acronyms = question.match(/\b[A-Z]{2,}\b/g) ?? [];
  const queries = [terms, names.join(" "), acronyms.join(" "), question];
  return [...new Set(queries.map((query) => collapse(query)).filter((query) => query.length > 2))].slice(0, 3);
}

export async function searchWikipedia(question: string): Promise<SourceDoc[]> {
  const titles: string[] = [];
  for (const query of wikiQueries(question)) {
    const searchUrl =
      "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=2&srsearch=" +
      encodeURIComponent(query);
    const search = JSON.parse(await fetchText(searchUrl)) as {
      query?: { search?: { title: string }[] };
    };
    for (const hit of search.query?.search ?? []) {
      if (!titles.includes(hit.title)) titles.push(hit.title);
    }
    if (titles.length >= 2) break;
  }
  const docs: SourceDoc[] = [];
  for (const [index, title] of titles.slice(0, 2).entries()) {
    const summaryUrl =
      "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title);
    const summary = JSON.parse(await fetchText(summaryUrl)) as {
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
      description?: string;
    };
    const extract = collapse(summary.extract ?? "");
    const page = summary.content_urls?.desktop?.page;
    if (!extract || !page) continue;
    docs.push({
      id: `wk${index + 1}`,
      kind: "wikipedia",
      title: summary.title || title,
      url: page,
      excerpt: clip(extract, 420),
      text: extract,
    });
  }
  return docs;
}

function decodeDuckLink(href: string): string {
  try {
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    const url = new URL(absolute, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    if (uddg) return uddg;
    if (url.hostname.endsWith("duckduckgo.com")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function parseDuckDuckGo(html: string): SourceDoc[] {
  const docs: SourceDoc[] = [];
  const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((match = linkRe.exec(html))) {
    const href = decodeDuckLink(decodeEntities(match[1]));
    const title = collapse(decodeEntities(match[2]));
    if (!href || !title || title.length < 8) continue;
    if (seen.has(href)) continue;
    if (/duckduckgo\.com|google\./i.test(href)) continue;
    seen.add(href);
    const after = html.slice(match.index, match.index + 900);
    const snippetMatch = after.match(/<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/i);
    const snippet = snippetMatch ? collapse(decodeEntities(snippetMatch[1])) : title;
    docs.push({
      id: `web${docs.length + 1}`,
      kind: "web",
      title,
      url: href,
      excerpt: clip(snippet, 320),
      text: snippet,
    });
    if (docs.length >= 3) break;
  }
  return docs;
}

export async function searchWeb(question: string): Promise<SourceDoc[]> {
  const query = encodeURIComponent(searchTerms(question) || question);
  const url = `https://lite.duckduckgo.com/lite/?q=${query}`;
  const html = await fetchText(url, 12000);
  const docs = parseDuckDuckGo(html);
  if (docs.length > 0) return docs;
  const retry = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ShodhSabha/0.1)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!retry.ok) return [];
  return parseDuckDuckGo(await retry.text());
}

async function settle<T>(label: string, task: Promise<T[]>, bag: GatherNotes): Promise<T[]> {
  try {
    return await task;
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    bag.notes.push(`${label} unavailable (${message}).`);
    return [];
  }
}

export async function gatherSources(question: string): Promise<{
  web: SourceDoc[];
  papers: SourceDoc[];
  notes: string[];
}> {
  const bag: GatherNotes = { notes: [] };
  const [wiki, web, arxiv, openalex] = await Promise.all([
    settle("Wikipedia", searchWikipedia(question), bag),
    settle("DuckDuckGo", searchWeb(question), bag),
    settle("arXiv", searchArxiv(question), bag),
    settle("OpenAlex", searchOpenAlex(question), bag),
  ]);
  const webRaw = dedupe([...wiki, ...web]);
  const paperRaw = dedupe([...arxiv, ...openalex]);
  const webDocs = onTopic(question, webRaw, 0.34).slice(0, 4);
  const papers = onTopic(question, paperRaw, 0.34).slice(0, 4);
  if (webDocs.length === 0) bag.notes.push(webRaw.length ? "Web Scout dropped pages that did not share the question's words." : "Web Scout found no pages.");
  if (papers.length === 0) bag.notes.push(paperRaw.length ? "Paper Scout dropped hits that did not share the question's words." : "Paper Scout found no papers.");
  return { web: retag(webDocs, "w"), papers: retag(papers, "p"), notes: bag.notes };
}

function mentionsAnchor(question: string, text: string): boolean {
  const anchors = question.match(/\b[A-Z]{3,}\b/g) ?? [];
  if (anchors.length === 0) return true;
  const hay = text.toLowerCase();
  return anchors.some((anchor) => hay.includes(anchor.toLowerCase()));
}

function onTopic(question: string, docs: SourceDoc[], minimum: number): SourceDoc[] {
  return docs.filter((doc) => {
    const blob = `${doc.title} ${doc.excerpt}`;
    return overlapRatio(question, blob) >= minimum && mentionsAnchor(question, blob);
  });
}

function dedupe(docs: SourceDoc[]): SourceDoc[] {
  const seen = new Set<string>();
  return docs.filter((doc) => {
    const key = collapse(doc.title).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function retag(docs: SourceDoc[], prefix: string): SourceDoc[] {
  return docs.map((doc, index) => ({ ...doc, id: `${prefix}${index + 1}` }));
}

export function kindLabel(kind: SourceKind): string {
  if (kind === "arxiv") return "arXiv";
  if (kind === "openalex") return "OpenAlex";
  if (kind === "wikipedia") return "Wikipedia";
  return "web";
}

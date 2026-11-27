const STOP = new Set([
  "what",
  "does",
  "the",
  "latest",
  "about",
  "how",
  "is",
  "it",
  "a",
  "an",
  "of",
  "for",
  "in",
  "on",
  "to",
  "and",
  "or",
  "with",
  "should",
  "would",
  "can",
  "do",
  "say",
  "from",
  "this",
  "that",
  "worth",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "its",
  "into",
  "over",
  "than",
  "then",
  "them",
  "their",
  "there",
  "have",
  "has",
  "had",
  "not",
  "but",
  "you",
  "your",
  "our",
  "who",
  "why",
  "when",
  "where",
  "which",
  "will",
  "just",
  "evidence",
]);

export function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalize(value: string): string {
  return collapse(value).toLowerCase();
}

export function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    });
}

export function searchTerms(question: string): string {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
  const picked = words.slice(0, 8);
  return picked.join(" ") || collapse(question).slice(0, 120);
}

export function questionTokens(question: string): string[] {
  return searchTerms(question).split(" ").filter(Boolean);
}

export function clip(value: string, max: number): string {
  const clean = collapse(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

export function firstSentence(value: string): string {
  const clean = collapse(value);
  const match = clean.match(/^(.{40,}?[.!?])\s/);
  if (match) return match[1];
  return clip(clean, 220);
}

export function overlapRatio(question: string, text: string): number {
  const tokens = questionTokens(question);
  if (tokens.length === 0) return 0;
  const hay = normalize(text);
  const hits = tokens.filter((token) => hay.includes(token)).length;
  return hits / tokens.length;
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function numbersIn(text: string): string[] {
  const found = text.match(/\d[\d,.]*/g) ?? [];
  return found.filter((item) => item.replace(/\D/g, "").length >= 2);
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeId(prefix: string, index: number): string {
  return `${prefix}${index}`;
}

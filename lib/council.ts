import { randomUUID } from "crypto";
import { renderBrief } from "./brief";
import { loadDemo, matchDemo } from "./demo";
import { detectBrain, complete, packetForPrompt } from "./llm";
import { skillPrompt } from "./skills";
import { gatherSources, kindLabel } from "./sources";
import { adalQuery, agent37Respond, mirrorToBand } from "./sponsors";
import {
  clip,
  firstSentence,
  overlapRatio,
  parseJsonObject,
  sleep,
} from "./text";
import type {
  A2AKind,
  A2AMessage,
  AgentId,
  Brief,
  Claim,
  RunOptions,
  Send,
  SourceDoc,
  SponsorNote,
} from "./types";
import {
  buildClaims,
  confidenceFrom,
  topicalClaims,
  unsupportedNumbers,
  verifyClaims,
  weakAgainstQuestion,
} from "./verify";

type Speaker = {
  send: Send;
  contextId: string;
  notes: SponsorNote[];
  mirror: boolean;
  pace: number;
};

function paceMs(): number {
  const raw = Number(process.env.DEMO_PACE_MS ?? "700");
  return Number.isFinite(raw) ? raw : 700;
}

async function say(
  speaker: Speaker,
  from: AgentId,
  to: AgentId,
  kind: A2AKind,
  text: string,
): Promise<A2AMessage> {
  const message: A2AMessage = {
    messageId: randomUUID(),
    contextId: speaker.contextId,
    taskId: `${from}->${to}`,
    from,
    to,
    kind,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
  await speaker.send({ type: "status", agent: from, state: "speaking" });
  await speaker.send({ type: "message", message });
  if (speaker.mirror) {
    const note = await mirrorToBand(message);
    if (speaker.notes.length === 0 || note.state !== "skipped") {
      speaker.notes.push(note);
    }
  }
  if (speaker.pace > 0) await sleep(speaker.pace);
  await speaker.send({ type: "status", agent: from, state: "done" });
  return message;
}

function plannerText(question: string): string {
  return [
    `Question in the sabha: "${question}"`,
    "",
    "I am splitting it into three lines, and I want quotes, not a vibe.",
    "Line A, scope. What would even count as an answer.",
    "Line B, evidence. Papers and reference pages, each with a URL.",
    "Line C, limits. What a page fails to show.",
    "",
    "Web Scout, take the open web for A and C.",
    "Paper Scout, take arXiv and OpenAlex for B.",
    "Do not upgrade a snippet into a verdict. Skeptic gets the next word.",
  ].join("\n");
}

function scoutText(name: string, docs: SourceDoc[], notes: string[]): string {
  const head =
    docs.length === 0
      ? `${name}: I came back empty.`
      : `${name}: I pulled ${docs.length} source${docs.length === 1 ? "" : "s"}. These are claims, not a conclusion.`;
  const body = docs.map((doc, index) => {
    return [
      `[${index + 1}] ${doc.title} (${kindLabel(doc.kind)}${doc.year ? `, ${doc.year}` : ""})`,
      doc.url,
      `"${doc.excerpt}"`,
    ].join("\n");
  });
  const foot = notes.length ? notes.join(" ") : "Packet is ready for the Skeptic.";
  return [head, "", ...body, "", foot].filter(Boolean).join("\n");
}

function skepticLines(question: string, claims: Claim[]): string[] {
  const lines: string[] = [];
  for (const claim of claims) {
    const weak = weakAgainstQuestion(question, claim);
    if (weak) lines.push(weak);
  }
  if (lines.length === 0 && claims.length > 0) {
    lines.push("The titles sit close to the question. I still want the quotes checked before anyone writes a verdict.");
  }
  if (claims.length === 0) {
    lines.push("There is nothing to challenge because the scouts brought no pages.");
  }
  return lines.slice(0, 5);
}

function factText(claims: Claim[]): string {
  if (claims.length === 0) {
    return "Nothing to check. Scribe, say that plainly and keep the confidence low.";
  }
  const rows = claims.map(
    (claim) => `${claim.id} ${claim.status}. ${claim.note} ${claim.title}.`,
  );
  const verified = claims.filter((claim) => claim.status === "verified").length;
  const partial = claims.filter((claim) => claim.status === "partial").length;
  const rejected = claims.filter((claim) => claim.status === "rejected").length;
  return [
    "Quote check against the fetched text.",
    "",
    ...rows,
    "",
    `Verified ${verified}, partial ${partial}, rejected ${rejected}.`,
    "Scribe, cite verified and partial only. Rejected quotes stay out of the brief.",
  ].join("\n");
}

function openQuestions(question: string, claims: Claim[], challenges: string[]): string[] {
  const items: string[] = [];
  const citeable = claims.filter((claim) => claim.status !== "rejected");
  if (citeable.length < 2) {
    items.push("A second primary source that uses the same terms as the question.");
  }
  if (/\b(worth|rent|profit|revenue)\b/i.test(question)) {
    const blob = citeable.map((claim) => claim.excerpt).join(" ");
    if (!/\b(profit|rent|margin|revenue|loss|payback)\b/i.test(blob)) {
      items.push("Rent, ticket size, and whether the kitchen makes money are not in these pages.");
    }
  }
  if (/latest|202\d|evidence/i.test(question)) {
    items.push("Which of these results have been replicated, and which are a single paper.");
  }
  if (challenges.some((line) => /background|encyclopedia|little vocabulary/i.test(line))) {
    items.push("A source that answers the decision, not just the surrounding topic.");
  }
  items.push("What would change the brief if it showed up next week.");
  return items.slice(0, 4);
}

function answerFrom(question: string, claims: Claim[], challenges: string[]): string {
  const citeable = claims.filter((claim) => claim.status !== "rejected");
  const topical = topicalClaims(question, citeable);
  if (citeable.length === 0) {
    return `I cannot answer "${question}" from the pages the scouts fetched. The honest output is the gap, not a guess.`;
  }
  if (topical.length === 0) {
    return `The scouts fetched ${citeable.length} page${citeable.length === 1 ? "" : "s"}, and none of them actually answer "${question}". I will not turn a nearby topic into a yes.`;
  }
  const points = topical
    .slice(0, 3)
    .map((claim) => {
      const sentence = firstSentence(claim.excerpt);
      return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
    })
    .join(" ");
  const caution = challenges[0]
    ? ` The Skeptic held this back: ${challenges[0]}`
    : "";
  return `The fetched pages support a narrow reading. ${points}${caution} They do not, on their own, close the question.`;
}

function renumber(docs: SourceDoc[]): { docs: SourceDoc[]; claims: Claim[] } {
  const claims = verifyClaims(buildClaims(docs), docs);
  return { docs, claims };
}

async function finish(input: {
  speaker: Speaker;
  question: string;
  mode: Brief["mode"];
  provider: string;
  docs: SourceDoc[];
  claims: Claim[];
  challenges: string[];
  answer: string;
  confidence: number;
  capturedAt?: string;
  sponsorNotes?: SponsorNote[];
}): Promise<Brief> {
  const opens = openQuestions(input.question, input.claims, input.challenges);
  const brief = renderBrief({
    question: input.question,
    mode: input.mode,
    provider: input.provider,
    answer: input.answer,
    confidence: input.confidence,
    openQuestions: opens,
    claims: input.claims,
    challenges: input.challenges,
    capturedAt: input.capturedAt,
  });
  await say(
    input.speaker,
    "scribe",
    "user",
    "brief",
    [
      `Brief is in. Confidence ${brief.confidence} out of 100, from the quote check, not from my mood.`,
      "",
      brief.answer,
      "",
      `Open questions: ${opens.length}. Citations are on the brief, and rejected quotes are marked so you can see what we threw out.`,
    ].join("\n"),
  );
  await input.speaker.send({ type: "brief", brief });
  const notes = input.sponsorNotes ?? input.speaker.notes;
  const band = notes.filter((note) => note.sponsor === "band");
  const lastBand = band[band.length - 1];
  if (lastBand) await input.speaker.send({ type: "sponsor", note: lastBand });
  for (const note of notes.filter((item) => item.sponsor !== "band")) {
    await input.speaker.send({ type: "sponsor", note });
  }
  return brief;
}

export async function runKeyless(question: string, send: Send, mirror = false): Promise<Brief> {
  const contextId = randomUUID();
  const speaker: Speaker = { send, contextId, notes: [], mirror, pace: 0 };
  await send({
    type: "meta",
    mode: "keyless",
    provider: "none",
    label: "Keyless gather. Public sources, no model call.",
    question,
  });
  await say(speaker, "planner", "web_scout", "task", plannerText(question));
  const gathered = await gatherSources(question);
  const webBlock = scoutText("Web Scout", gathered.web, gathered.notes.filter((n) => /Wikipedia|DuckDuckGo|Web Scout/.test(n)));
  const paperBlock = scoutText("Paper Scout", gathered.papers, gathered.notes.filter((n) => /arXiv|OpenAlex|Paper Scout/.test(n)));
  await say(speaker, "web_scout", "skeptic", "finding", webBlock);
  await say(speaker, "paper_scout", "skeptic", "finding", paperBlock);
  const docs = [...gathered.web, ...gathered.papers];
  const { claims } = renumber(docs);
  const challenges = skepticLines(question, claims);
  await say(
    speaker,
    "skeptic",
    "fact_checker",
    "challenge",
    ["Holding the claims up to the question.", "", ...challenges, "", "Fact-checker, verify the quotes before the Scribe writes."].join("\n"),
  );
  const checked = verifyClaims(claims, docs);
  await say(speaker, "fact_checker", "scribe", "verdict", factText(checked));
  const moneyGap =
    /\b(worth|rent|profit|revenue)\b/i.test(question) &&
    topicalClaims(question, checked).every((claim) => !/\b(profit|rent|margin|revenue|loss|payback)\b/i.test(claim.excerpt));
  const extra = moneyGap ? 28 : 0;
  const confidence = confidenceFrom(checked, extra, question);
  const answer = answerFrom(question, checked, challenges);
  return finish({
    speaker,
    question,
    mode: "keyless",
    provider: "none",
    docs,
    claims: checked,
    challenges,
    answer,
    confidence,
  });
}

async function modelProse(input: {
  role: AgentId;
  sessionId: string;
  system: string;
  user: string;
  fallback: string;
}): Promise<{ text: string; failed?: string }> {
  try {
    const raw = await complete({
      role: input.role,
      system: input.system,
      user: input.user,
      sessionId: input.sessionId,
    });
    const parsed = parseJsonObject(raw);
    const prose = typeof parsed?.prose === "string" ? parsed.prose : raw;
    return { text: clip(prose, 1200) };
  } catch (error) {
    const failed = error instanceof Error ? error.message : "model failed";
    return { text: input.fallback, failed };
  }
}

export async function runLive(question: string, send: Send): Promise<Brief> {
  const brain = detectBrain();
  const contextId = randomUUID();
  const speaker: Speaker = { send, contextId, notes: [], mirror: true, pace: 0 };
  const started = Date.now();
  await send({
    type: "meta",
    mode: "live",
    provider: brain,
    label: `Live council. Reasoning via ${brain}. Sources are still fetched directly.`,
    question,
  });
  const skill = skillPrompt();
  const system = [
    "You are one seat in ShodhSabha, a research council.",
    "Speak in short sentences. No bullet theatre, no preamble.",
    "Never invent a URL, a paper, or a number.",
    skill,
    'Return JSON only: {"prose":"..."}',
  ].join(" ");

  const planner = await modelProse({
    role: "planner",
    sessionId: contextId,
    system: `${system} You are the Planner. Split the question into three lines and assign Web Scout and Paper Scout.`,
    user: question,
    fallback: plannerText(question),
  });
  await say(speaker, "planner", "web_scout", "task", planner.text);

  const gathered = await gatherSources(question);
  const docs = [...gathered.web, ...gathered.papers];
  const draftClaims = buildClaims(docs).map((claim, index) => ({
    ...claim,
    id: `c${index + 1}`,
  }));
  const webClaims = draftClaims.filter((claim) => gathered.web.some((doc) => doc.url === claim.url));
  const paperClaims = draftClaims.filter((claim) => gathered.papers.some((doc) => doc.url === claim.url));

  const web = await modelProse({
    role: "web_scout",
    sessionId: contextId,
    system: `${system} You are Web Scout. Report only the packet. Refer to ids like c1.`,
    user: packetForPrompt("Web packet", webClaims),
    fallback: scoutText("Web Scout", gathered.web, gathered.notes),
  });
  const paper = await modelProse({
    role: "paper_scout",
    sessionId: contextId,
    system: `${system} You are Paper Scout. Report only the packet. Refer to ids like c1.`,
    user: packetForPrompt("Paper packet", paperClaims),
    fallback: scoutText("Paper Scout", gathered.papers, gathered.notes),
  });
  await say(speaker, "web_scout", "skeptic", "finding", `${scoutText("Web Scout", gathered.web, [])}\n\n${web.text}`);
  await say(speaker, "paper_scout", "skeptic", "finding", `${scoutText("Paper Scout", gathered.papers, [])}\n\n${paper.text}`);

  const localChallenges = skepticLines(question, draftClaims);
  const skeptic = await modelProse({
    role: "skeptic",
    sessionId: contextId,
    system: `${system} You are the Skeptic. Name weak claims by id. Do not add sources.`,
    user: `${packetForPrompt("Claims", draftClaims)}\n\nLocal flags:\n${localChallenges.join("\n")}`,
    fallback: localChallenges.join("\n"),
  });
  const challenges = [skeptic.text, ...localChallenges].slice(0, 6);
  await say(speaker, "skeptic", "fact_checker", "challenge", ["Holding the claims up to the question.", "", ...challenges].join("\n"));

  const checked = verifyClaims(draftClaims, docs);
  const sneaky = unsupportedNumbers(`${web.text}\n${paper.text}\n${skeptic.text}`, docs);
  let verdict = factText(checked);
  if (sneaky.length) {
    verdict += `\n\nThe model mentioned ${sneaky.join(", ")}, which I cannot find in the fetched text. Those figures stay out.`;
  }
  await say(speaker, "fact_checker", "scribe", "verdict", verdict);

  const moneyGap =
    /\b(worth|rent|profit|revenue)\b/i.test(question) &&
    topicalClaims(question, checked).every((claim) => !/\b(profit|rent|margin|revenue|loss|payback)\b/i.test(claim.excerpt));
  const extra = (sneaky.length ? 10 : 0) + (moneyGap ? 28 : 0);
  let confidence = confidenceFrom(checked, extra, question);
  let answer = answerFrom(question, checked, localChallenges);
  const scribe = await modelProse({
    role: "scribe",
    sessionId: contextId,
    system: `${system} You are the Scribe. Write a four sentence answer using only surviving claims. No new facts.`,
    user: `Question: ${question}\n\nVerdict:\n${verdict}\n\nDraft answer:\n${answer}`,
    fallback: answer,
  });
  const scribeNumbers = unsupportedNumbers(scribe.text, docs);
  if (scribeNumbers.length === 0 && overlapRatio(question, scribe.text) > 0.2) {
    answer = scribe.text;
  } else if (scribeNumbers.length) {
    confidence = Math.max(6, confidence - 8);
    answer = `${answer} The Scribe's draft named ${scribeNumbers.join(", ")}, which is not in the packet, so I kept the extractive answer.`;
  }

  const sponsorNotes: SponsorNote[] = [];
  if (planner.failed || web.failed || paper.failed || skeptic.failed || scribe.failed) {
    sponsorNotes.push({
      sponsor: "lyzr",
      state: "failed",
      detail: [planner.failed, web.failed, paper.failed, skeptic.failed, scribe.failed].filter(Boolean).join(" "),
    });
  } else if (brain === "lyzr") {
    sponsorNotes.push({ sponsor: "lyzr", state: "used", detail: "Each seat reasoned through the Lyzr inference chat API." });
  }

  if (process.env.AGENT37_API_KEY && process.env.AGENT37_INSTANCE_URL && Date.now() - started < 40000) {
    try {
      const second = await agent37Respond(
        [
          "You are a second scribe for ShodhSabha.",
          "Rewrite the answer in four sentences.",
          "Do not add URLs, papers, or numbers that are not already in the draft.",
          `Question: ${question}`,
          `Draft: ${answer}`,
        ].join("\n"),
      );
      const invented = unsupportedNumbers(second.text, docs);
      if (invented.length === 0) {
        answer = second.text;
        sponsorNotes.push({
          sponsor: "agent37",
          state: "used",
          detail: "Agent37 rewrote the scribe pass on the configured instance.",
        });
      } else {
        sponsorNotes.push({
          sponsor: "agent37",
          state: "failed",
          detail: `Agent37 added ${invented.join(", ")}, which is not in the packet. Draft kept.`,
        });
      }
    } catch (error) {
      sponsorNotes.push({
        sponsor: "agent37",
        state: "failed",
        detail: error instanceof Error ? error.message : "Agent37 call failed.",
      });
    }
  } else if (process.env.AGENT37_API_KEY || process.env.AGENT37_INSTANCE_URL) {
    sponsorNotes.push({
      sponsor: "agent37",
      state: "skipped",
      detail: "Need both AGENT37_API_KEY and AGENT37_INSTANCE_URL, and enough time left in the request.",
    });
  }

  if (process.env.ADAL_ENABLED !== "false" && Date.now() - started < 45000) {
    try {
      const note = await adalQuery(
        [
          "Do not edit files. In three sentences, name one missing source for this research question.",
          question,
        ].join("\n"),
      );
      answer = `${answer}\n\nAdaL, on the local CLI, flagged a gap: ${clip(note, 400)}`;
      sponsorNotes.push({ sponsor: "adal", state: "used", detail: "Local AdaL CLI returned a gap note." });
    } catch {
      sponsorNotes.push({
        sponsor: "adal",
        state: "skipped",
        detail: "AdaL CLI is not installed or not logged in. The skill file is still loaded into the prompts.",
      });
    }
  }

  return finish({
    speaker,
    question,
    mode: "live",
    provider: brain,
    docs,
    claims: checked,
    challenges: localChallenges,
    answer,
    confidence,
    sponsorNotes,
  });
}

export async function replayDemo(demoId: string, send: Send): Promise<Brief> {
  const demo = loadDemo(demoId);
  const pace = paceMs();
  await send({
    type: "meta",
    mode: "demo",
    provider: "recording",
    label: demo.label,
    question: demo.question,
  });
  for (const event of demo.events) {
    if (event.type === "meta") continue;
    if (event.type === "message") {
      await send({ type: "status", agent: event.message.from, state: "speaking" });
      await send(event);
      if (pace > 0) await sleep(pace);
      await send({ type: "status", agent: event.message.from, state: "done" });
      continue;
    }
    if (event.type === "brief" || event.type === "sponsor" || event.type === "status") {
      await send(event);
    }
  }
  return demo.brief;
}

export async function runSabha(options: RunOptions): Promise<Brief> {
  const question = options.question.trim();
  const brain = detectBrain();
  const demo = options.demoId ? { id: options.demoId } : matchDemo(question);
  const useDemo = options.forceDemo || (brain === "none" && demo);
  if (useDemo && demo) {
    try {
      return await replayDemo(demo.id, options.send);
    } catch (error) {
      if (options.forceDemo || options.demoId) throw error;
    }
  }
  if (brain === "none") return runKeyless(question, options.send, false);
  return runLive(question, options.send);
}

export { matchDemo };

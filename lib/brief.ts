import { firstSentence } from "./text";
import { kindLabel } from "./sources";
import type { Brief, Claim, ClaimStatus } from "./types";

const STATUS_WORD: Record<ClaimStatus, string> = {
  verified: "verified",
  partial: "partial",
  rejected: "rejected",
};

export function renderBrief(input: {
  question: string;
  mode: Brief["mode"];
  provider: string;
  answer: string;
  confidence: number;
  openQuestions: string[];
  claims: Claim[];
  challenges: string[];
  capturedAt?: string;
}): Brief {
  const citeable = input.claims.filter((claim) => claim.status !== "rejected");
  const lines: string[] = [];
  lines.push(`# ${input.question}`);
  lines.push("");
  lines.push("## Short answer");
  lines.push(input.answer);
  lines.push("");
  lines.push("## What the sources support");
  if (citeable.length === 0) {
    lines.push("Nothing survived the quote check.");
  } else {
    for (const claim of citeable) {
      lines.push(`- ${firstSentence(claim.excerpt)} ([${claim.id}](${claim.url}))`);
    }
  }
  lines.push("");
  lines.push("## What they do not support");
  const challenges = input.challenges.length
    ? input.challenges
    : ["The packet does not, by itself, close the question."];
  for (const line of challenges) lines.push(`- ${line}`);
  lines.push("");
  lines.push("## Confidence");
  lines.push(
    `${input.confidence} / 100. The score is the share of quotes that matched fetched text, with a penalty when the packet is thin. It is not a probability that a decision will work.`,
  );
  lines.push("");
  lines.push("## Open questions");
  for (const line of input.openQuestions) lines.push(`- ${line}`);
  lines.push("");
  lines.push("## Sources");
  input.claims.forEach((claim, index) => {
    const year = "";
    lines.push(
      `${index + 1}. ${claim.title}${year} (${kindLabel(claim.kind)}, ${STATUS_WORD[claim.status]}). ${claim.url}`,
    );
  });
  if (input.mode === "demo") {
    lines.push("");
    lines.push(`Recorded run${input.capturedAt ? `, captured ${input.capturedAt}` : ""}. Not a live model call.`);
  } else if (input.mode === "keyless") {
    lines.push("");
    lines.push("Keyless gather. Public sources, extractive brief, no model call.");
  } else {
    lines.push("");
    lines.push(`Live council via ${input.provider}. Quotes still had to match a fetched page.`);
  }

  return {
    question: input.question,
    mode: input.mode,
    provider: input.provider,
    answer: input.answer,
    markdown: lines.join("\n"),
    confidence: input.confidence,
    openQuestions: input.openQuestions,
    citations: input.claims.map((claim) => ({
      id: claim.id,
      title: claim.title,
      url: claim.url,
      kind: claim.kind,
      excerpt: claim.excerpt,
      status: claim.status,
    })),
    capturedAt: input.capturedAt,
  };
}

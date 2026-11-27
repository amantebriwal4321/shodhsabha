import { normalize, overlapRatio } from "./text";
import type { Claim, ClaimStatus, SourceDoc } from "./types";

export function buildClaims(docs: SourceDoc[]): Claim[] {
  return docs.map((doc, index) => ({
    id: `c${index + 1}`,
    sourceId: doc.id,
    title: doc.title,
    url: doc.url,
    kind: doc.kind,
    excerpt: doc.excerpt,
    status: "partial",
    note: "Pending check.",
  }));
}

export function verifyClaims(claims: Claim[], docs: SourceDoc[]): Claim[] {
  const byUrl = new Map(docs.map((doc) => [doc.url, doc]));
  return claims.map((claim) => {
    const doc = byUrl.get(claim.url);
    if (!doc) {
      return {
        ...claim,
        status: "rejected",
        note: "URL was not in the fetched set.",
      };
    }
    const hay = normalize(`${doc.text} ${doc.excerpt} ${doc.title}`);
    const needle = normalize(claim.excerpt).slice(0, 180);
    if (needle.length < 24) {
      return { ...claim, status: "partial", note: "Excerpt is too short to check cleanly." };
    }
    if (hay.includes(needle.slice(0, 80))) {
      return { ...claim, status: "verified", note: "Excerpt is inside the fetched text." };
    }
    const tokens = needle.split(" ").filter((token) => token.length > 4);
    if (tokens.length === 0) {
      return { ...claim, status: "partial", note: "Not enough distinctive words to match." };
    }
    const hit = tokens.filter((token) => hay.includes(token)).length / tokens.length;
    if (hit >= 0.72) {
      return { ...claim, status: "partial", note: "Most excerpt words appear in the fetched text." };
    }
    return { ...claim, status: "rejected", note: "Excerpt does not match the fetched text." };
  });
}

export function topicalClaims(question: string, claims: Claim[]): Claim[] {
  return claims.filter((claim) => overlapRatio(question, `${claim.title} ${claim.excerpt}`) >= 0.34);
}

export function confidenceFrom(claims: Claim[], extraPenalty = 0, question?: string): number {
  const pool = question ? topicalClaims(question, claims) : claims;
  if (pool.length === 0) return 12;
  const weight: Record<ClaimStatus, number> = {
    verified: 1,
    partial: 0.45,
    rejected: 0,
  };
  const raw = pool.reduce((sum, claim) => sum + weight[claim.status], 0) / pool.length;
  const verified = pool.filter((claim) => claim.status === "verified").length;
  const factor = verified < 2 ? 0.82 : 1;
  const score = Math.round(raw * factor * 100 - extraPenalty);
  return Math.max(6, Math.min(90, score));
}

export function weakAgainstQuestion(question: string, claim: Claim): string | null {
  const ratio = overlapRatio(question, `${claim.title} ${claim.excerpt}`);
  if (ratio < 0.34) {
    return `${claim.id} shares little vocabulary with the question. Treat it as background.`;
  }
  if (claim.kind === "wikipedia" && /latest|evidence|study|paper/i.test(question)) {
    return `${claim.id} is an encyclopedia page. Useful for scope, weak as "latest evidence".`;
  }
  return null;
}

export function unsupportedNumbers(prose: string, docs: SourceDoc[]): string[] {
  const hay = normalize(docs.map((doc) => `${doc.text} ${doc.title}`).join(" "));
  const suspects = new Set<string>();
  for (const raw of prose.match(/\d[\d,.]*/g) ?? []) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 2) continue;
    if (!hay.includes(raw.toLowerCase()) && !hay.includes(digits)) suspects.add(raw);
  }
  return [...suspects];
}

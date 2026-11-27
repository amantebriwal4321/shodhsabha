import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchDemo } from "../lib/demo";
import { finchCanonical, finchSecretBytes, finchSignature } from "../lib/finch-sign";
import { citationSkill } from "../lib/skills";
import { parseArxiv, parseDuckDuckGo } from "../lib/sources";
import { renderBrief } from "../lib/brief";
import { buildClaims, confidenceFrom, verifyClaims } from "../lib/verify";
import type { SourceDoc } from "../lib/types";

const doc = (over: Partial<SourceDoc>): SourceDoc => ({
  id: "s1",
  kind: "arxiv",
  title: "Hallucination checks",
  url: "https://example.test/paper",
  excerpt: "Retrieval grounding reduced unsupported claims in the reported sample.",
  text: "Retrieval grounding reduced unsupported claims in the reported sample. The study did not measure a hospital deployment.",
  ...over,
});

test("quote check accepts an excerpt that sits in the fetched text", () => {
  const source = doc({});
  const [claim] = verifyClaims(buildClaims([source]), [source]);
  assert.equal(claim.status, "verified");
});

test("quote check rejects an excerpt from outside the packet", () => {
  const source = doc({});
  const claims = buildClaims([source]);
  claims[0].url = "https://example.test/other";
  const [claim] = verifyClaims(claims, [source]);
  assert.equal(claim.status, "rejected");
  assert.ok(confidenceFrom([claim]) < 20);
});

test("brief keeps rejected quotes out of the support list", () => {
  const source = doc({});
  const claims = verifyClaims(buildClaims([source]), [source]);
  claims.push({
    ...claims[0],
    id: "c2",
    url: "https://example.test/nope",
    title: "Invented",
    status: "rejected",
    excerpt: "This sentence was never fetched.",
  });
  const brief = renderBrief({
    question: "What helps?",
    mode: "keyless",
    provider: "none",
    answer: "A narrow reading.",
    confidence: 40,
    openQuestions: ["A replication."],
    claims,
    challenges: ["c2 is not in the packet."],
  });
  assert.match(brief.markdown, /example\.test\/paper/);
  assert.doesNotMatch(brief.markdown, /This sentence was never fetched/);
  assert.equal(brief.citations.length, 2);
});

test("demo questions match only the recorded wording", () => {
  assert.equal(matchDemo("What does the latest evidence say about LLM hallucination fixes?")?.id, "hallucination");
  assert.equal(matchDemo("something else entirely"), null);
});

test("finch canonical string is the five documented lines", () => {
  const body = Buffer.from('{"status":"ready"}');
  const secret = Buffer.alloc(32, 9).toString("base64url");
  const canonical = finchCanonical("GET", "/api/finch/health", "1700000000", "nonce", body);
  const lines = canonical.split("\n");
  assert.deepEqual(lines.slice(0, 4), ["GET", "/api/finch/health", "1700000000", "nonce"]);
  assert.equal(lines[4], createHash("sha256").update(body).digest("hex"));
  const signature = finchSignature(canonical, finchSecretBytes(secret, "finch_v2"));
  assert.match(signature, /^v1=[0-9a-f]{64}$/);
  assert.throws(() => finchSecretBytes("short", "finch_v2"));
});

test("citation skill is the text the council loads", () => {
  const skill = citationSkill();
  assert.match(skill.instructions, /fetched packet/);
});

test("arxiv and duckduckgo parsers keep the link and a quote", () => {
  const xml = `<?xml version="1.0"?><feed><entry><id>https://arxiv.org/abs/2401.00001</id><title>Fixing  hallucinations</title><summary>We report a drop in unsupported answers.</summary><published>2024-02-01T00:00:00Z</published></entry></feed>`;
  const papers = parseArxiv(xml);
  assert.equal(papers[0].url, "https://arxiv.org/abs/2401.00001");
  assert.match(papers[0].excerpt, /unsupported answers/);
  const html = `<a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.test%2Fupi&amp;rut=abc" class='result-link'>UPI vendors study</a><td class='result-snippet'>Street vendors still mix cash.</td>`;
  const web = parseDuckDuckGo(html);
  assert.equal(web[0].url, "https://example.test/upi");
  assert.match(web[0].excerpt, /Street vendors/);
});

test("submission copy avoids dash characters the form rejects", () => {
  const text = readFileSync(new URL("../docs/SUBMISSION.md", import.meta.url), "utf8");
  assert.equal(/\u2014|\u2013|\u2015/.test(text), false);
  assert.equal(text.includes("--"), false);
  const short = text.split("## Short description")[1]?.split("## ")[0] ?? "";
  const words = short.trim().split(/\s+/).filter(Boolean);
  assert.ok(words.length > 40 && words.length <= 150, `short description word count ${words.length}`);
});

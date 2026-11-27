import { readFileSync } from "fs";
import path from "path";
import { normalize } from "./text";
import type { Brief, SabhaEvent } from "./types";

export type DemoMeta = {
  id: string;
  question: string;
  file: string;
  blurb: string;
};

export const DEMOS: DemoMeta[] = [
  {
    id: "hallucination",
    question: "What does the latest evidence say about LLM hallucination fixes?",
    file: "hallucination.json",
    blurb: "Papers, then a skeptic",
  },
  {
    id: "cloud-kitchen",
    question: "Is it worth opening a cloud kitchen in Koramangala?",
    file: "cloud-kitchen.json",
    blurb: "A local bet, thin evidence",
  },
  {
    id: "upi",
    question: "How ready is UPI for small street vendors?",
    file: "upi.json",
    blurb: "Public rails, open questions",
  },
];

export type DemoFile = {
  id: string;
  question: string;
  capturedAt: string;
  label: string;
  events: SabhaEvent[];
  brief: Brief;
};

export function matchDemo(question: string): DemoMeta | null {
  const needle = normalize(question).replace(/[?!.]/g, "");
  if (!needle) return null;
  for (const demo of DEMOS) {
    const hay = normalize(demo.question).replace(/[?!.]/g, "");
    if (needle === hay) return demo;
  }
  return null;
}

export function loadDemo(id: string): DemoFile {
  const demo = DEMOS.find((item) => item.id === id);
  if (!demo) throw new Error(`Unknown recording: ${id}`);
  const file = path.join(process.cwd(), "data/demos", demo.file);
  const parsed = JSON.parse(readFileSync(file, "utf8")) as DemoFile;
  parsed.brief.mode = "demo";
  parsed.brief.capturedAt = parsed.capturedAt;
  return parsed;
}

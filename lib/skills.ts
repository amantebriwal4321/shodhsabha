import { readFileSync } from "fs";
import path from "path";

export type FinchSkill = {
  name: string;
  slug: string;
  summary: string;
  instructions: string;
  steps: string[];
  limitations: string[];
};

let cached: FinchSkill | null = null;

export function citationSkill(): FinchSkill {
  if (cached) return cached;
  const file = path.join(process.cwd(), "finch/skills/citation-discipline/skill.json");
  cached = JSON.parse(readFileSync(file, "utf8")) as FinchSkill;
  return cached;
}

export function skillPrompt(): string {
  const skill = citationSkill();
  return `${skill.name}: ${skill.instructions}`;
}

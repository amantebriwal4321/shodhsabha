import type { AgentId } from "./types";

export type AgentProfile = {
  id: AgentId;
  name: string;
  hindi: string;
  role: string;
  color: string;
};

export const COUNCIL: AgentProfile[] = [
  {
    id: "planner",
    name: "Planner",
    hindi: "Mukhiya",
    role: "Splits the question and assigns lines of inquiry.",
    color: "#e6b15a",
  },
  {
    id: "web_scout",
    name: "Web Scout",
    hindi: "Khabari",
    role: "Reads Wikipedia and the open web.",
    color: "#2f9e8f",
  },
  {
    id: "paper_scout",
    name: "Paper Scout",
    hindi: "Pathaka",
    role: "Pulls arXiv and OpenAlex.",
    color: "#9eb7ff",
  },
  {
    id: "skeptic",
    name: "Skeptic",
    hindi: "Sangshayi",
    role: "Challenges claims that do not answer the question.",
    color: "#e25b86",
  },
  {
    id: "fact_checker",
    name: "Fact-checker",
    hindi: "Pramanika",
    role: "Checks that every quote is in the fetched text.",
    color: "#f0a202",
  },
  {
    id: "scribe",
    name: "Scribe",
    hindi: "Lekhaka",
    role: "Writes the cited brief and the confidence score.",
    color: "#d4a0ff",
  },
];

export function agentById(id: AgentId): AgentProfile {
  const found = COUNCIL.find((agent) => agent.id === id);
  if (!found) {
    return {
      id,
      name: id,
      hindi: "",
      role: "",
      color: "#f3e6d4",
    };
  }
  return found;
}

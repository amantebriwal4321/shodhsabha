import { clip } from "./text";
import type { AgentId } from "./types";

export type Brain = "lyzr" | "openai" | "groq" | "gemini" | "none";

const ROLE_ENV: Partial<Record<AgentId, string>> = {
  planner: "LYZR_PLANNER_AGENT_ID",
  web_scout: "LYZR_WEB_SCOUT_AGENT_ID",
  paper_scout: "LYZR_PAPER_SCOUT_AGENT_ID",
  skeptic: "LYZR_SKEPTIC_AGENT_ID",
  fact_checker: "LYZR_FACT_CHECKER_AGENT_ID",
  scribe: "LYZR_SCRIBE_AGENT_ID",
};

export function lyzrAgentId(role: AgentId): string | undefined {
  const specific = ROLE_ENV[role];
  const fromRole = specific ? process.env[specific] : undefined;
  return fromRole || process.env.LYZR_AGENT_ID || undefined;
}

export function lyzrReady(): boolean {
  return Boolean(process.env.LYZR_API_KEY && process.env.LYZR_AGENT_ID);
}

export function detectBrain(): Brain {
  if (process.env.LYZR_API_KEY && lyzrAgentId("planner")) return "lyzr";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "none";
}

export async function complete(input: {
  role: AgentId;
  system: string;
  user: string;
  sessionId: string;
}): Promise<string> {
  const brain = detectBrain();
  if (brain === "none") throw new Error("No model provider is configured.");
  if (brain === "lyzr") return lyzrChat(input);
  if (brain === "openai") return openaiChat(input.system, input.user, process.env.OPENAI_API_KEY!, "https://api.openai.com/v1/chat/completions", process.env.OPENAI_MODEL || "gpt-4o-mini");
  if (brain === "groq") return openaiChat(input.system, input.user, process.env.GROQ_API_KEY!, "https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_MODEL || "llama-3.3-70b-versatile");
  return geminiChat(input.system, input.user);
}

async function lyzrChat(input: {
  role: AgentId;
  system: string;
  user: string;
  sessionId: string;
}): Promise<string> {
  const agentId = lyzrAgentId(input.role);
  if (!agentId || !process.env.LYZR_API_KEY) throw new Error("Lyzr agent id is missing.");
  const message = `${input.system}\n\n${input.user}`;
  const response = await fetch("https://agent-prod.studio.lyzr.ai/v3/inference/chat/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.LYZR_API_KEY,
    },
    body: JSON.stringify({
      user_id: process.env.LYZR_USER_ID || "shodhsabha",
      agent_id: agentId,
      session_id: `${agentId}-${input.sessionId}`.slice(0, 120),
      message,
    }),
    signal: AbortSignal.timeout(28000),
  });
  const payload = (await response.json().catch(() => ({}))) as { response?: string; message?: string };
  if (!response.ok) {
    throw new Error(`Lyzr chat failed (${response.status}).`);
  }
  const text = payload.response || payload.message || "";
  if (!text) throw new Error("Lyzr returned an empty response.");
  return text;
}

async function openaiChat(
  system: string,
  user: string,
  apiKey: string,
  url: string,
  model: string,
): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(28000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Model call failed (${response.status}).`);
  }
  const text = payload.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Model returned an empty response.");
  return text;
}

async function geminiChat(system: string, user: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(process.env.GEMINI_API_KEY || "")}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
      generationConfig: { temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(28000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini failed (${response.status}).`);
  }
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export function packetForPrompt(title: string, rows: { id: string; title: string; url: string; excerpt: string }[]): string {
  if (rows.length === 0) return `${title}: none.`;
  return [
    title,
    ...rows.map((row) => `[${row.id}] ${row.title}\n${row.url}\n${clip(row.excerpt, 320)}`),
  ].join("\n\n");
}

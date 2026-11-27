import { execFile } from "child_process";
import { promisify } from "util";
import type { A2AMessage, SponsorNote } from "./types";

const exec = promisify(execFile);

export function bandConfigured(): boolean {
  return Boolean(process.env.BAND_API_KEY && process.env.BAND_CHAT_ID && process.env.BAND_MENTION_HANDLE);
}

export async function mirrorToBand(message: A2AMessage): Promise<SponsorNote> {
  if (!bandConfigured()) {
    return {
      sponsor: "band",
      state: "skipped",
      detail: "Set BAND_API_KEY, BAND_CHAT_ID, and BAND_MENTION_HANDLE to mirror the sabha into a room.",
    };
  }
  const handle = process.env.BAND_MENTION_HANDLE!.replace(/^@/, "");
  const base = (process.env.BAND_REST_URL || "https://app.band.ai/api/v1").replace(/\/$/, "");
  const content = `@${handle} ${message.from} to ${message.to}: ${message.text}`.slice(0, 6000);
  const mention: { handle: string; id?: string; name?: string } = { handle };
  if (process.env.BAND_MENTION_ID) mention.id = process.env.BAND_MENTION_ID;
  try {
    const response = await fetch(`${base}/agent/chats/${process.env.BAND_CHAT_ID}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.BAND_API_KEY!,
      },
      body: JSON.stringify({ message: { content, mentions: [mention] } }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      const body = await response.text();
      return {
        sponsor: "band",
        state: "failed",
        detail: `BAND rejected the message (${response.status}). ${body.slice(0, 180)}`,
      };
    }
    return { sponsor: "band", state: "used", detail: "Posted into the BAND room." };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "BAND request failed.";
    return { sponsor: "band", state: "failed", detail };
  }
}

export function agent37Configured(): boolean {
  return Boolean(process.env.AGENT37_API_KEY && process.env.AGENT37_INSTANCE_URL);
}

export async function agent37Respond(input: string, sessionId?: string): Promise<{
  text: string;
  sessionId?: string;
}> {
  if (!agent37Configured()) {
    throw new Error("AGENT37_API_KEY and AGENT37_INSTANCE_URL are required.");
  }
  const base = process.env.AGENT37_INSTANCE_URL!.replace(/\/$/, "");
  const response = await fetch(`${base}/v1/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent37-Key": process.env.AGENT37_API_KEY!,
    },
    body: JSON.stringify({
      input,
      stream: false,
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
    signal: AbortSignal.timeout(25000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    output_text?: string;
    session_id?: string;
    status?: string;
    error?: { message?: string };
  };
  if (!response.ok || payload.status === "failed") {
    throw new Error(payload.error?.message || `Agent37 failed (${response.status}).`);
  }
  if (!payload.output_text) throw new Error("Agent37 returned no output_text.");
  return { text: payload.output_text, sessionId: payload.session_id };
}

/**
 * Creates a Hermes instance. This spends wallet credit. Callers must check
 * AGENT37_AUTO_CREATE themselves. Not used by the default sabha path.
 */
export async function agent37CreateInstance(): Promise<{ id: string; url: string }> {
  if (!process.env.AGENT37_API_KEY) throw new Error("AGENT37_API_KEY is missing.");
  if (process.env.AGENT37_AUTO_CREATE !== "true") {
    throw new Error("Refusing to create an instance unless AGENT37_AUTO_CREATE=true.");
  }
  const response = await fetch("https://api.agent37.com/v1/instances", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AGENT37_API_KEY}`,
    },
    body: JSON.stringify({
      template: process.env.AGENT37_TEMPLATE || "agent37-hermes",
      budget: { credit_micros: 1_000_000 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = (await response.json().catch(() => ({}))) as { id?: string; url?: string };
  if (!response.ok || !payload.id || !payload.url) {
    throw new Error(`Agent37 create failed (${response.status}).`);
  }
  return { id: payload.id, url: payload.url };
}

export async function adalInstalled(): Promise<boolean> {
  try {
    await exec("adal", ["--version"], { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

export async function adalQuery(prompt: string): Promise<string> {
  if (process.env.ADAL_ENABLED === "false") {
    throw new Error("ADAL_ENABLED is false.");
  }
  const { stdout } = await exec(
    "adal",
    ["--query", prompt, "--output", "text", "--enabled-default-tools", ""],
    { timeout: 20000, maxBuffer: 200_000 },
  );
  const text = stdout.trim();
  if (!text) throw new Error("AdaL returned no text.");
  return text;
}

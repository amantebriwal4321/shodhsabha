import { randomUUID } from "crypto";
import { runSabha } from "@/lib/council";
import { questionFromFinch, readSignedBody, signedJson } from "@/lib/finch-http";
import { saveTask } from "@/lib/finch-tasks";
import type { Brief } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function invocationId(body: unknown): string {
  if (body && typeof body === "object" && typeof (body as { invocation_id?: unknown }).invocation_id === "string") {
    return (body as { invocation_id: string }).invocation_id;
  }
  return randomUUID();
}

function isAsync(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const mode = (body as { interaction_mode?: unknown }).interaction_mode;
  return typeof mode === "string" && mode.length > 0 && mode !== "conversation_turn";
}

export async function POST(request: Request) {
  const check = await readSignedBody(request);
  if (!check.ok) return check.response;
  const id = invocationId(check.json);
  const question = questionFromFinch(check.json).slice(0, 500);
  if (!question) {
    return signedJson(request, 200, {
      protocol_version: "2.0",
      invocation_id: id,
      status: "failed",
      error: { code: "bad_input", message: "Send the research question as input text." },
    });
  }

  let brief: Brief | null = null;
  let failure = "";
  try {
    brief = await runSabha({
      question,
      send: (event) => {
        if (event.type === "brief") brief = event.brief;
      },
    });
  } catch (error) {
    failure = error instanceof Error ? error.message : "Sabha failed.";
  }

  if (!brief) {
    return signedJson(request, 200, {
      protocol_version: "2.0",
      invocation_id: id,
      status: "failed",
      error: { code: "sabha_failed", message: failure || "No brief." },
    });
  }

  const text = brief.markdown;
  if (isAsync(check.json)) {
    const merchantTaskId = `tsk_${randomUUID().replace(/-/g, "")}`;
    saveTask({
      id: merchantTaskId,
      status: "completed",
      text,
      completedAt: new Date().toISOString(),
    });
    return signedJson(request, 202, {
      protocol_version: "2.0",
      invocation_id: id,
      status: "accepted",
      merchant_task_id: merchantTaskId,
    });
  }

  return signedJson(request, 200, {
    protocol_version: "2.0",
    invocation_id: id,
    status: "completed",
    message: {
      role: "agent",
      content: [{ type: "text", text }],
    },
    artifacts: [],
    completed_at: new Date().toISOString(),
  });
}

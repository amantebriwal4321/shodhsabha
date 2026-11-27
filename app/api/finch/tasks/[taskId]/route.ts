import { readSignedBody, signedJson } from "@/lib/finch-http";
import { readTask } from "@/lib/finch-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const check = await readSignedBody(request);
  if (!check.ok) return check.response;
  const { taskId } = await context.params;
  const task = readTask(decodeURIComponent(taskId));
  if (!task) {
    return signedJson(request, 404, {
      protocol_version: "2.0",
      merchant_task_id: taskId,
      status: "failed",
      error: { code: "unknown_task", message: "No task with that id in this process." },
    });
  }
  return signedJson(request, 200, {
    protocol_version: "2.0",
    merchant_task_id: task.id,
    status: task.status,
    sequence: 1,
    message: {
      role: "agent",
      content: [{ type: "text", text: task.text }],
    },
    completed_at: task.completedAt,
  });
}

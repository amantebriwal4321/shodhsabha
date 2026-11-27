import { runSabha } from "@/lib/council";
import { encodeSSE } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    question?: unknown;
    demoId?: unknown;
    forceDemo?: unknown;
  } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 500) {
    return Response.json({ error: "Ask a question, up to 500 characters." }, { status: 400 });
  }
  const demoId = typeof body?.demoId === "string" ? body.demoId : undefined;
  const forceDemo = body?.forceDemo === true;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeSSE(event, data)));
      };
      try {
        await runSabha({
          question,
          demoId,
          forceDemo,
          send: async (event) => {
            send(event.type, event);
          },
        });
        send("done", { ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The sabha failed.";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

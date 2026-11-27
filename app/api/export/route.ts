import { briefToPdf } from "@/lib/pdf";
import type { Brief } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBrief(value: unknown): value is Brief {
  if (!value || typeof value !== "object") return false;
  const brief = value as Brief;
  return typeof brief.markdown === "string" && typeof brief.question === "string" && Array.isArray(brief.citations);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { brief?: unknown; format?: unknown } | null;
  if (!body || !isBrief(body.brief)) {
    return Response.json({ error: "Missing brief." }, { status: 400 });
  }
  if (body.format === "md") {
    return new Response(body.brief.markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": "attachment; filename=shodhsabha-brief.md",
      },
    });
  }
  const pdf = await briefToPdf(body.brief);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=shodhsabha-brief.pdf",
    },
  });
}

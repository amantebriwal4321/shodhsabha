import { DEMOS } from "@/lib/demo";
import { detectBrain, lyzrReady } from "@/lib/llm";
import { adalInstalled, agent37Configured, bandConfigured } from "@/lib/sponsors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const adal = process.env.ADAL_ENABLED === "false" ? false : await adalInstalled();
  return Response.json({
    brain: detectBrain(),
    sponsors: {
      lyzr: lyzrReady(),
      band: bandConfigured(),
      finch: Boolean(process.env.FINCH_REQUEST_SECRET && process.env.FINCH_KEY_ID),
      agent37: agent37Configured(),
      adal,
    },
    demos: DEMOS.map((demo) => ({
      id: demo.id,
      question: demo.question,
      blurb: demo.blurb,
    })),
  });
}

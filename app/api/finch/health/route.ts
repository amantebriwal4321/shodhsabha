import { signedJson, readSignedBody } from "@/lib/finch-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const check = await readSignedBody(request);
  if (!check.ok) return check.response;
  return signedJson(request, 200, { status: "ready" });
}

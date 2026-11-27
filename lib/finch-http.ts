import { signResponse, verifyPlatformSignature } from "./finch-sign";

export function requestPath(request: Request): string {
  const url = new URL(request.url);
  return url.pathname + url.search;
}

export async function readSignedBody(request: Request): Promise<
  { ok: true; raw: Buffer; json: unknown } | { ok: false; response: Response }
> {
  const raw = Buffer.from(await request.arrayBuffer());
  const check = verifyPlatformSignature({
    method: request.method,
    pathWithQuery: requestPath(request),
    rawBody: raw,
    timestamp: request.headers.get("x-platform-timestamp"),
    nonce: request.headers.get("x-platform-nonce"),
    signature: request.headers.get("x-platform-signature"),
    keyId: request.headers.get("x-platform-key-id"),
  });
  if (!check.ok) {
    return {
      ok: false,
      response: signedJson(request, 401, {
        protocol_version: "2.0",
        status: "failed",
        error: { code: "unauthorized", message: check.reason },
      }),
    };
  }
  if (raw.length === 0) return { ok: true, raw, json: null };
  try {
    return { ok: true, raw, json: JSON.parse(raw.toString("utf8")) as unknown };
  } catch {
    return {
      ok: false,
      response: signedJson(request, 400, {
        protocol_version: "2.0",
        status: "failed",
        error: { code: "bad_json", message: "Body was not JSON." },
      }),
    };
  }
}

export function signedJson(request: Request, status: number, body: unknown): Response {
  const raw = Buffer.from(JSON.stringify(body));
  const signature = signResponse({
    method: request.method,
    pathWithQuery: requestPath(request),
    rawBody: raw,
  });
  return new Response(raw, {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-ShodhSabha-Signing": signature ? "v1" : "unsigned",
      ...(signature ?? {}),
    },
  });
}

export function questionFromFinch(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as {
    question?: unknown;
    input?: { content?: { type?: string; text?: string }[] };
    conversation?: { messages?: { content?: { text?: string }[] }[] };
  };
  if (typeof record.question === "string") return record.question.trim();
  const parts = record.input?.content ?? [];
  const fromInput = parts.map((part) => part.text ?? "").join("\n").trim();
  if (fromInput) return fromInput;
  const messages = record.conversation?.messages ?? [];
  const last = messages[messages.length - 1];
  return (last?.content ?? []).map((part) => part.text ?? "").join("\n").trim();
}

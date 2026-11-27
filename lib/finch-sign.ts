import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export type FinchWire = "finch_v2" | "agenton_v0";

export function finchWire(): FinchWire {
  return process.env.FINCH_WIRE_PROTOCOL === "agenton_v0" ? "agenton_v0" : "finch_v2";
}

/** Secret bytes, as published in Finch's mutual HMAC section. */
export function finchSecretBytes(displayed: string, wire: FinchWire = finchWire()): Buffer {
  if (wire === "agenton_v0") return Buffer.from(displayed, "utf8");
  const bytes = Buffer.from(displayed, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== displayed) {
    throw new Error("Invalid Finch signing secret");
  }
  return bytes;
}

/**
 * Canonical string from the Finch docs, five lines:
 * METHOD, PATH_WITH_QUERY, TIMESTAMP, NONCE, SHA256(raw_body).
 * The docs show those fields on separate lines, so the joiner is a newline.
 */
export function finchCanonical(
  method: string,
  pathWithQuery: string,
  timestamp: string,
  nonce: string,
  rawBody: Buffer | string,
): string {
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  return [method.toUpperCase(), pathWithQuery, timestamp, nonce, bodyHash].join("\n");
}

export function finchSignature(canonical: string, secret: Buffer): string {
  const hex = createHmac("sha256", secret).update(canonical).digest("hex");
  return `v1=${hex}`;
}

const seenNonces = new Map<string, number>();

export function rememberNonce(nonce: string, now = Date.now()): boolean {
  for (const [key, at] of seenNonces) {
    if (now - at > 10 * 60 * 1000) seenNonces.delete(key);
  }
  if (seenNonces.has(nonce)) return false;
  seenNonces.set(nonce, now);
  return true;
}

export function verifyPlatformSignature(input: {
  method: string;
  pathWithQuery: string;
  rawBody: Buffer;
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
  keyId: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const secretText = process.env.FINCH_REQUEST_SECRET;
  if (!secretText) return { ok: true };
  const expectedKey = process.env.FINCH_KEY_ID;
  if (!input.timestamp || !input.nonce || !input.signature) {
    return { ok: false, reason: "Missing Finch signature headers." };
  }
  if (expectedKey && input.keyId !== expectedKey) {
    return { ok: false, reason: "Finch key id does not match FINCH_KEY_ID." };
  }
  const stamp = Number(input.timestamp);
  if (!Number.isFinite(stamp)) return { ok: false, reason: "Bad Finch timestamp." };
  const skew = Math.abs(Date.now() / 1000 - stamp);
  if (skew > 300) return { ok: false, reason: "Finch timestamp is outside the 300s window." };
  if (!rememberNonce(input.nonce)) return { ok: false, reason: "Finch nonce was reused." };
  let secret: Buffer;
  try {
    secret = finchSecretBytes(secretText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bad secret.";
    return { ok: false, reason: message };
  }
  const canonical = finchCanonical(
    input.method,
    input.pathWithQuery,
    input.timestamp,
    input.nonce,
    input.rawBody,
  );
  const expected = finchSignature(canonical, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature.trim());
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "Finch signature did not match." };
  }
  return { ok: true };
}

export function signResponse(input: {
  method: string;
  pathWithQuery: string;
  rawBody: Buffer;
}): Record<string, string> | null {
  const secretText = process.env.FINCH_REQUEST_SECRET;
  const keyId = process.env.FINCH_KEY_ID;
  if (!secretText || !keyId) return null;
  const secret = finchSecretBytes(secretText);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const signature = finchSignature(
    finchCanonical(input.method, input.pathWithQuery, timestamp, nonce, input.rawBody),
    secret,
  );
  return {
    "X-Agent-Key-Id": keyId,
    "X-Agent-Timestamp": timestamp,
    "X-Agent-Nonce": nonce,
    "X-Agent-Signature": signature,
  };
}

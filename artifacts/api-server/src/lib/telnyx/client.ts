import crypto from "crypto";
import { logger } from "../logger.js";

const TELNYX_API = "https://api.telnyx.com/v2";

function apiKey(): string {
  const k = process.env.TELNYX_API_KEY;
  if (!k) throw new Error("TELNYX_API_KEY is not set");
  return k;
}

function profileId(): string | undefined {
  return process.env.TELNYX_MESSAGING_PROFILE_ID || undefined;
}

function fromNumber(): string | undefined {
  return process.env.TELNYX_FROM_NUMBER || undefined;
}

export interface TelnyxSendResult {
  providerMessageId: string;
}

/**
 * Send an SMS via Telnyx Messaging API v2.
 * Either `messaging_profile_id` (preferred — the profile selects the number)
 * or `from` must be configured.
 */
export async function sendSms(params: {
  to: string;
  text: string;
}): Promise<TelnyxSendResult> {
  const body: Record<string, unknown> = {
    to: params.to,
    text: params.text,
  };
  const pid = profileId();
  const from = fromNumber();
  if (pid) body.messaging_profile_id = pid;
  else if (from) body.from = from;
  else throw new Error("Telnyx requires TELNYX_MESSAGING_PROFILE_ID or TELNYX_FROM_NUMBER");

  const res = await fetch(`${TELNYX_API}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telnyx send error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  return { providerMessageId: json.data.id };
}

export type LookupCarrierType = "mobile" | "landline" | "voip" | "unknown";

/**
 * Telnyx Number Lookup. Returns the carrier type so callers can avoid
 * sending SMS to landlines.
 *
 * Pricing: ~$0.001–0.005 per lookup — cheaper than wasting a $0.01 SMS
 * on a confirmed landline.
 */
export async function lookupNumber(phone: string): Promise<LookupCarrierType> {
  const url = `${TELNYX_API}/number_lookup/${encodeURIComponent(phone)}?type=carrier`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telnyx lookup error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    data?: { carrier?: { type?: string } };
  };
  const t = (json.data?.carrier?.type ?? "").toLowerCase();
  if (t === "mobile" || t === "landline" || t === "voip") return t;
  return "unknown";
}

/**
 * Verify a Telnyx webhook payload using its Ed25519 signature.
 * Telnyx sends `telnyx-signature-ed25519` and `telnyx-timestamp` headers.
 *
 * If `TELNYX_PUBLIC_KEY` is unset (e.g. local dev), returns true with a
 * warning so we don't block local testing — production MUST set the key.
 */
export function verifyWebhookSignature(params: {
  rawBody: string;
  signature: string | undefined;
  timestamp: string | undefined;
  toleranceSeconds?: number;
}): boolean {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey) {
    logger.warn("TELNYX_PUBLIC_KEY not set — accepting webhook without signature verification");
    return true;
  }
  const { rawBody, signature, timestamp } = params;
  if (!signature || !timestamp) return false;

  const tolerance = params.toleranceSeconds ?? 300;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > tolerance) return false;

  try {
    // Accept either PEM-formatted (BEGIN/END headers) or base64 SPKI/DER.
    // Telnyx's dashboard typically shows the raw base64 portion; some
    // operators paste the full PEM. Handle both gracefully.
    const trimmed = publicKey.trim();
    const key = trimmed.includes("BEGIN")
      ? crypto.createPublicKey({ key: trimmed, format: "pem", type: "spki" })
      : crypto.createPublicKey({
          key: Buffer.from(trimmed, "base64"),
          format: "der",
          type: "spki",
        });
    return crypto.verify(
      null,
      Buffer.from(`${timestamp}|${rawBody}`),
      key,
      Buffer.from(signature, "base64"),
    );
  } catch (err) {
    logger.error({ err }, "Telnyx signature verification threw");
    return false;
  }
}

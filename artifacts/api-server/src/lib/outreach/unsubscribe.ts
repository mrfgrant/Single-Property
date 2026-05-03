import crypto from "crypto";

/**
 * HMAC-signed one-click unsubscribe URLs.
 *
 * Without a signature, anyone with the URL pattern could maliciously
 * suppress arbitrary email addresses (denial-of-service for our own
 * transactional mail). The `sig` parameter binds the email to a secret
 * only our server knows.
 */
/**
 * Returns the HMAC secret used to sign unsubscribe tokens.
 *
 * Fails CLOSED in production: if no secret env var is set, throws so
 * that token generation/verification cannot silently succeed with a
 * known fallback (which would let attackers forge unsubscribe URLs and
 * suppress arbitrary recipients). In development we fall back to a
 * documented placeholder so local boots don't require operator setup.
 */
function secret(): string {
  const explicit =
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.SESSION_SECRET;
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "UNSUBSCRIBE_SECRET (or STRIPE_WEBHOOK_SECRET / SESSION_SECRET) must be set in production",
    );
  }
  return "dev-only-unsubscribe-secret-change-me";
}

export function signUnsubscribeToken(email: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(email.toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  if (!email || !token) return false;
  const expected = signUnsubscribeToken(email);
  // Constant-time compare to avoid timing leaks.
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildUnsubscribeUrl(baseUrl: string, email: string): string {
  const token = signUnsubscribeToken(email);
  return `${baseUrl}/api/email/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

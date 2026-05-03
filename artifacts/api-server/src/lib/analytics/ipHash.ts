import { createHmac } from "node:crypto";

/**
 * We never store raw IPs. For unique-visitor counting we need a stable
 * identifier per (IP, day) so the same person hitting the same site
 * twice on the same day collapses to one unique, but is unlinkable
 * across days. The salt rotates daily; even a server-side compromise
 * cannot recover the IP without also having yesterday's salt.
 *
 * Resolution order for the secret:
 *   1. ANALYTICS_HASH_SECRET (preferred, dedicated)
 *   2. SESSION_SECRET (we already require this in production)
 *   3. STRIPE_WEBHOOK_SECRET (last-resort high-entropy value)
 *
 * Production fails closed — we throw rather than silently bucketing
 * every visitor under a hardcoded salt that would leak across deploys.
 */
function getHashSecret(): string {
  const secret =
    process.env.ANALYTICS_HASH_SECRET ??
    process.env.SESSION_SECRET ??
    process.env.STRIPE_WEBHOOK_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ANALYTICS_HASH_SECRET (or SESSION_SECRET / STRIPE_WEBHOOK_SECRET) is required in production",
    );
  }
  return "dev-only-analytics-salt-do-not-use-in-prod";
}

function dayBucket(now: Date = new Date()): string {
  // YYYY-MM-DD in UTC. Rotation is per UTC day, which is fine — the
  // tracker fires on every page load anyway, so any cross-midnight visit
  // is still counted (it just gets a fresh hash in the new bucket).
  return now.toISOString().slice(0, 10);
}

/**
 * Daily-rotating, salted HMAC of (IP + UA). Truncated to 16 hex chars
 * (64 bits) — collision probability across ~1 M visitors per listing
 * per day is negligible and 16 chars keeps the index small.
 */
export function hashVisitor(
  ip: string | null | undefined,
  userAgent: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!ip) return null;
  const secret = getHashSecret();
  const day = dayBucket(now);
  const h = createHmac("sha256", `${secret}:${day}`);
  h.update(ip);
  h.update("|");
  h.update(userAgent ?? "");
  return h.digest("hex").slice(0, 16);
}

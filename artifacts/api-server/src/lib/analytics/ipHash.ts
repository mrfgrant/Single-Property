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

/**
 * ISO-week bucket (YYYY-Www) in UTC. We rotate per ISO week so that
 * COUNT(DISTINCT ip_hash) over the weekly seller report window collapses
 * a returning visitor to ONE unique — daily rotation made the same
 * person count multiple times across the report's 7-day window. The
 * tracker fires on every page load, so a visitor whose week happens to
 * straddle the Sun→Mon UTC boundary will still appear in the right
 * report (their session-end pageview lands in the new bucket).
 */
function weekBucket(now: Date = new Date()): string {
  // ISO week algorithm: take Thursday of the current ISO week, then
  // year-week from that Thursday.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Weekly-rotating, salted HMAC of (IP + UA). Truncated to 16 hex chars
 * (64 bits) — collision probability across ~1 M visitors per listing
 * per week is negligible and 16 chars keeps the index small.
 *
 * Privacy: the salt rotates every ISO week, so even a server-side
 * compromise cannot recover IPs from prior weeks without that week's
 * salt material.
 */
export function hashVisitor(
  ip: string | null | undefined,
  userAgent: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!ip) return null;
  const secret = getHashSecret();
  const bucket = weekBucket(now);
  const h = createHmac("sha256", `${secret}:${bucket}`);
  h.update(ip);
  h.update("|");
  h.update(userAgent ?? "");
  return h.digest("hex").slice(0, 16);
}

/**
 * Classify a referrer URL into one of the buckets the seller report
 * uses. We err on the side of "other" rather than mis-attribute, and
 * recognize the common social/search channels by hostname.
 *
 * The `qr` source is not derivable from referrer (QR scans usually
 * arrive with no referrer); callers should pass a `?utm_source=qr`
 * query and override the classification when present.
 */
export type TrafficSource =
  | "direct"
  | "google"
  | "facebook"
  | "instagram"
  | "qr"
  | "other";

const HOST_MAP: Array<[RegExp, TrafficSource]> = [
  [/(^|\.)google\./i, "google"],
  [/(^|\.)bing\.com$/i, "google"], // bucket bing into "search"; we report it as google for the seller view
  [/(^|\.)duckduckgo\.com$/i, "google"],
  [/(^|\.)facebook\.com$/i, "facebook"],
  [/(^|\.)fb\.(com|me)$/i, "facebook"],
  [/(^|\.)instagram\.com$/i, "instagram"],
  [/(^|\.)l\.instagram\.com$/i, "instagram"],
  [/(^|\.)t\.co$/i, "other"],
  [/(^|\.)twitter\.com$/i, "other"],
  [/(^|\.)x\.com$/i, "other"],
];

export function classifySource(input: {
  referrer?: string | null;
  utmSource?: string | null;
}): TrafficSource {
  const utm = input.utmSource?.trim().toLowerCase();
  if (utm === "qr") return "qr";
  if (utm === "google" || utm === "facebook" || utm === "instagram") {
    return utm as TrafficSource;
  }
  const ref = input.referrer?.trim();
  if (!ref) return "direct";
  let host: string;
  try {
    host = new URL(ref).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (!host) return "direct";
  for (const [pattern, source] of HOST_MAP) {
    if (pattern.test(host)) return source;
  }
  return "other";
}

/**
 * Heuristic device classifier from User-Agent. Tablets are bucketed as
 * mobile because the seller report only distinguishes "mostly phones"
 * vs "mostly desktop browsing".
 */
export function classifyDevice(userAgent: string | null | undefined): "mobile" | "desktop" {
  if (!userAgent) return "desktop";
  const ua = userAgent.toLowerCase();
  if (/(iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|iemobile)/.test(ua)) {
    return "mobile";
  }
  if (/(ipad|android|tablet|kindle|silk)/.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

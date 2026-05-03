import type { Request } from "express";

/**
 * Best-effort city/region lookup from request headers. We do not embed
 * a MaxMind / IP-DB binary blob — the brief explicitly asks for
 * city-level geo only, and Cloudflare (which we already use for
 * domains) sends `cf-ipcity` / `cf-region` on every proxied request.
 *
 * For local dev / unproxied requests we fall back to nulls, which the
 * seller report renders as "Unknown" without breaking aggregation.
 */
export interface CityGeo {
  city: string | null;
  region: string | null;
}

export function deriveCityGeo(req: Request): CityGeo {
  const h = req.headers;
  const cfCity = pickHeader(h["cf-ipcity"]);
  const cfRegion = pickHeader(h["cf-region"]);
  if (cfCity || cfRegion) {
    return {
      city: cfCity ? decodeURIComponent(cfCity) : null,
      region: cfRegion ? decodeURIComponent(cfRegion) : null,
    };
  }
  // Vercel-style headers (in case we ever proxy through one).
  const xCity = pickHeader(h["x-vercel-ip-city"]);
  const xRegion = pickHeader(h["x-vercel-ip-country-region"]);
  if (xCity || xRegion) {
    return {
      city: xCity ? decodeURIComponent(xCity) : null,
      region: xRegion ? decodeURIComponent(xRegion) : null,
    };
  }
  return { city: null, region: null };
}

function pickHeader(v: string | string[] | undefined): string | null {
  if (!v) return null;
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s.trim() : null;
}

/**
 * Extract the originating client IP from common proxy headers, falling
 * back to the socket address. Returns null if nothing usable is found.
 */
export function deriveClientIp(req: Request): string | null {
  const h = req.headers;
  const cfIp = pickHeader(h["cf-connecting-ip"]);
  if (cfIp) return cfIp;
  const xff = pickHeader(h["x-forwarded-for"]);
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xReal = pickHeader(h["x-real-ip"]);
  if (xReal) return xReal;
  return req.socket?.remoteAddress ?? null;
}

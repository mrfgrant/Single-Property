/**
 * ZIP → IANA timezone resolver. The CSRA market is GA + a sliver of SC,
 * both Eastern Time, so a static map covers ~100% of our listings. If a
 * ZIP outside the served range ever sneaks in we default to ET as well —
 * better to send the seller report at "8am Eastern" than to skip it.
 *
 * For future expansion, drop a ZIP→TZ JSON dataset behind this function
 * (e.g. ZIPCODE_TZ_LOOKUP env var pointing to a file).
 */

const DEFAULT_TZ = "America/New_York";

// Explicit overrides for ZIP prefixes that aren't ET. None today; this
// hook is here so we can extend without changing callers.
const ZIP_PREFIX_OVERRIDES: Array<[RegExp, string]> = [
  // Pacific
  [/^(9[0-6])/, "America/Los_Angeles"],
  // Mountain
  [/^(8[0-4]|59)/, "America/Denver"],
  // Central
  [/^(5[0-8]|6[0-7]|7[0-9])/, "America/Chicago"],
];

export function resolveTimezone(zip: string | null | undefined): string {
  if (!zip) return DEFAULT_TZ;
  const normalized = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(normalized)) return DEFAULT_TZ;
  for (const [pattern, tz] of ZIP_PREFIX_OVERRIDES) {
    if (pattern.test(normalized)) return tz;
  }
  return DEFAULT_TZ;
}

/**
 * Compute the local wall-clock parts (year/month/day/hour/dayOfWeek)
 * for a given UTC instant in the listing's timezone. Uses Intl rather
 * than pulling in a date library.
 *
 * dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat (matches JS Date.getDay()).
 */
export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
}

export function getLocalParts(instant: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const lookup: Record<string, string> = {};
  for (const p of parts) lookup[p.type] = p.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    // "24" can appear in en-US 24h mode at midnight; normalize to 0.
    hour: Number(lookup.hour) % 24,
    minute: Number(lookup.minute),
    second: Number(lookup.second),
    dayOfWeek: weekdayMap[lookup.weekday ?? "Sun"] ?? 0,
  };
}

/**
 * Returns the UTC instant corresponding to "Monday at 00:00:00 local" for
 * the week containing `instant`. Computed in two passes:
 *   1. Step back day-by-day until we land on Monday in the target zone.
 *   2. Subtract the full local clock offset (hour+minute+second+ms) so
 *      we anchor exactly to local midnight regardless of when the cron
 *      actually fires within that hour.
 *
 * This is the canonical bucket for seller_reports_sent dedupe — every
 * report attempt within a given local week resolves to the same UTC
 * value, so the unique (listing_id, week_start) constraint holds even
 * when retries land at different minute offsets.
 *
 * Pass 2 is required because IANA zone offsets are minute-aligned (the
 * minimum granularity in tzdata), so subtracting hour+minute+second
 * exactly cancels the local clock to 00:00:00.
 */
export function getLocalWeekStart(instant: Date, timeZone: string): Date {
  const local = getLocalParts(instant, timeZone);
  const daysBack = (local.dayOfWeek + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
  const candidate = new Date(instant.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const snapped = getLocalParts(candidate, timeZone);
  const offsetMs =
    snapped.hour * 60 * 60 * 1000 +
    snapped.minute * 60 * 1000 +
    snapped.second * 1000 +
    candidate.getUTCMilliseconds();
  return new Date(candidate.getTime() - offsetMs);
}

/**
 * Compute when a cold-outreach email should actually go out.
 *
 * Goal: deliver during the agent's morning inbox-check window
 * (7:00–9:00 AM America/New_York), regardless of when the nightly MLS
 * sync detects the listing.
 *
 * Behavior:
 *   - If `now` is BEFORE today's 7:00 AM ET window, schedule for a
 *     random minute inside today's 7–9 AM ET window.
 *   - If `now` is INSIDE today's 7–9 AM ET window, send immediately
 *     (returns a Date <= now).
 *   - If `now` is AFTER 9:00 AM ET, schedule for a random minute inside
 *     tomorrow's 7–9 AM ET window.
 *
 * Randomization within the window prevents a thundering herd of
 * outbound emails the instant the cron rolls past 7 AM, which both
 * looks robotic to recipients and is bad for deliverability.
 */
export function nextSendWindow7to9amET(now: Date = new Date()): Date {
  const tz = "America/New_York";

  // Get the current time-of-day in ET as hours/minutes, plus the ET
  // calendar date components so we can construct a target instant.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const etYear = Number(parts.year);
  const etMonth = Number(parts.month);
  const etDay = Number(parts.day);
  const etHour = Number(parts.hour === "24" ? "0" : parts.hour);
  const etMinute = Number(parts.minute);
  const etMinutesOfDay = etHour * 60 + etMinute;

  const WINDOW_START = 7 * 60; // 07:00
  const WINDOW_END = 9 * 60; // 09:00

  // We're inside the window — fire on the next dispatcher tick.
  if (etMinutesOfDay >= WINDOW_START && etMinutesOfDay < WINDOW_END) {
    return now;
  }

  // Pick a random target within the 2-hour window.
  const targetMinuteOfWindow = Math.floor(Math.random() * (WINDOW_END - WINDOW_START));
  const targetHour = Math.floor((WINDOW_START + targetMinuteOfWindow) / 60);
  const targetMinute = (WINDOW_START + targetMinuteOfWindow) % 60;

  // Decide which day to schedule for: today (if before 7 AM ET) or
  // tomorrow (if at/after 9 AM ET).
  const scheduleForTomorrow = etMinutesOfDay >= WINDOW_END;
  const target = etDateToUtc(
    etYear,
    etMonth,
    etDay + (scheduleForTomorrow ? 1 : 0),
    targetHour,
    targetMinute,
  );
  return target;
}

/**
 * Convert a wall-clock America/New_York timestamp (year/month/day/h/m)
 * into the UTC `Date` it actually points at, accounting for DST.
 *
 * We construct a candidate UTC Date by treating the inputs as if they
 * were UTC, then look at how the same instant *renders* in ET, and
 * correct by the observed offset. One iteration is enough because the
 * ET ↔ UTC offset is locally constant (changes only at DST boundaries
 * once per six months).
 */
function etDateToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const candidateUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(candidateUtc)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const renderedUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    0,
    0,
  );
  // candidateUtc was treated as UTC but we wanted it to mean ET; the
  // delta tells us by how much to shift.
  const deltaMs = candidateUtc - renderedUtc;
  return new Date(candidateUtc + deltaMs);
}

import { Router } from "express";
import { z } from "zod/v4";
import { db, analyticsEventsTable, listingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { classifySource, classifyDevice } from "../lib/analytics/source.js";
import { deriveCityGeo, deriveClientIp } from "../lib/analytics/geo.js";
import { hashVisitor } from "../lib/analytics/ipHash.js";

const log = logger.child({ component: "analytics" });

const ANALYTICS_EVENT_TYPES = [
  "pageview",
  "session_start",
  "session_end",
  "gallery_photo_view",
  "lead_submitted",
] as const;

const eventSchema = z.object({
  listingId: z.uuid(),
  sessionId: z.string().min(8).max(64),
  eventType: z.enum(ANALYTICS_EVENT_TYPES),
  occurredAt: z.iso.datetime().optional(),
  referrer: z.string().max(2000).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  photoIndex: z.number().int().min(0).max(500).optional().nullable(),
  path: z.string().max(500).optional().nullable(),
});

const ingestSchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

const analyticsRouter = Router();

/**
 * Batched event ingest. Tracker posts up to 50 events at a time
 * (typically 1–3 per page, sent via sendBeacon on session_end). We
 * derive source/device/geo server-side from headers so the tracker
 * payload stays tiny (<2 KB).
 *
 * Unknown listing IDs are silently dropped (200 OK) — the tracker
 * runs on demo / example listings that have no row in `listings`,
 * and rejecting them would noisily fail the beacon for no benefit.
 */
analyticsRouter.post("/analytics/events", async (req, res) => {
  // Back-compat: legacy "{event, ...}" callers still hit this route.
  // We accept both shapes and short-circuit the legacy one to a log.
  if (req.body && typeof req.body === "object" && "event" in req.body && !("events" in req.body)) {
    log.info(req.body, "analytics_event_legacy");
    res.status(204).end();
    return;
  }

  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid analytics payload", issues: parsed.error.issues });
    return;
  }

  const ip = deriveClientIp(req);
  const ua = req.headers["user-agent"] ?? null;
  const geo = deriveCityGeo(req);
  const device = classifyDevice(ua);
  const ipHash = hashVisitor(ip, ua);

  // Resolve which listingIds are real in one shot; drop the rest.
  const requestedIds = Array.from(new Set(parsed.data.events.map((e) => e.listingId)));
  const existing = await db
    .select({ id: listingsTable.id })
    .from(listingsTable)
    .where(inArray(listingsTable.id, requestedIds));
  const validIds = new Set(existing.map((r) => r.id));

  const now = new Date();
  const rows = parsed.data.events
    .filter((e) => validIds.has(e.listingId))
    .map((e) => ({
      listingId: e.listingId,
      sessionId: e.sessionId,
      eventType: e.eventType,
      source: classifySource({ referrer: e.referrer, utmSource: e.utmSource }),
      device,
      city: geo.city,
      region: geo.region,
      referrer: e.referrer ?? null,
      photoIndex: e.photoIndex ?? null,
      ipHash,
      userAgent: ua,
      path: e.path ?? null,
      occurredAt: e.occurredAt ? new Date(e.occurredAt) : now,
    }));

  if (rows.length === 0) {
    res.status(204).end();
    return;
  }

  try {
    await db.insert(analyticsEventsTable).values(rows);
  } catch (err) {
    log.error({ err, count: rows.length }, "analytics insert failed");
    res.status(500).json({ error: "Failed to record events" });
    return;
  }

  res.status(204).end();
});

export default analyticsRouter;

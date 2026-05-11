import { Router } from "express";
import { z } from "zod/v4";
import { db, emailClickEventsTable } from "@workspace/db";
import { desc, isNotNull, eq } from "drizzle-orm";
import { adminAuth } from "../middleware/adminAuth.js";
import { backfillWeeklyReport } from "../lib/analytics/cron.js";
import { logger } from "../lib/logger.js";

const log = logger.child({ component: "admin-analytics" });

const router = Router();

/**
 * Operator backfill: re-enqueue the weekly seller report for a listing
 * for a specific week. Useful for debugging / ad-hoc requests when a
 * seller asks "can you re-send last week's report?".
 *
 * If `weekStart` is omitted we default to the previous full local week.
 * The dedupe key on the outbox row ensures a second call within the
 * same week is a no-op (use `force=1` to bypass — handled implicitly
 * because operator backfill always runs in force mode).
 */
const bodySchema = z.object({
  weekStart: z.iso.datetime().optional(),
});

router.post("/admin/listings/:id/weekly-report", adminAuth, async (req, res) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "Missing listing id" });
    return;
  }
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }
  try {
    const result = await backfillWeeklyReport(id, parsed.data.weekStart);
    if (!result.sent) {
      res.status(409).json({ ok: false, ...result });
      return;
    }
    log.info({ listingId: id, weekStart: result.weekStart }, "Operator backfill enqueued");
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err, listingId: id }, "Backfill failed");
    res.status(500).json({ error: "Backfill failed" });
  }
});

/**
 * GET /api/admin/click-events
 * Returns recent email link click events, newest first.
 * Optional query params: ?clicked=1 (only clicked), ?listingId=uuid, ?agentEmail=x, ?limit=50
 */
router.get("/admin/click-events", adminAuth, async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
  const onlyClicked = req.query.clicked === "1";
  const listingId = typeof req.query.listingId === "string" ? req.query.listingId : null;
  const agentEmail = typeof req.query.agentEmail === "string" ? req.query.agentEmail.toLowerCase() : null;

  let query = db.select().from(emailClickEventsTable).$dynamic();

  if (onlyClicked) query = query.where(isNotNull(emailClickEventsTable.clickedAt));
  if (listingId) query = query.where(eq(emailClickEventsTable.listingId, listingId));
  if (agentEmail) query = query.where(eq(emailClickEventsTable.agentEmail, agentEmail));

  const rows = await query.orderBy(desc(emailClickEventsTable.createdAt)).limit(limit);
  res.json({ clickEvents: rows });
});

export default router;

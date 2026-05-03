import { Router, type IRouter } from "express";
import { adminAuth } from "../middleware/adminAuth.js";
import { getSyncStatus, runSync } from "../lib/mls/sync.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/**
 * GET /api/mls/status — public, for ops/health visibility.
 * Returns whether MLS is configured, last sync timestamps, watermark,
 * total ingested listings, and any last error.
 */
router.get("/mls/status", async (_req, res) => {
  try {
    const status = await getSyncStatus();
    res.json(status);
  } catch (err) {
    logger.error({ err }, "Failed to fetch MLS sync status");
    res.status(500).json({ error: "Failed to fetch MLS status" });
  }
});

/**
 * POST /api/mls/sync?kind=full|delta — admin-only, manual trigger.
 * Returns the sync result. Useful for first-run after credentials land.
 */
router.post("/mls/sync", adminAuth, async (req, res) => {
  const kind = req.query.kind === "full" ? "full" : "delta";
  try {
    const result = await runSync(kind);
    res.json(result);
  } catch (err) {
    logger.error({ err, kind }, "Manual MLS sync failed");
    res.status(500).json({
      error: "MLS sync failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;

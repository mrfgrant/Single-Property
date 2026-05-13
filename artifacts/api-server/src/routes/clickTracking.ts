import { Router } from "express";
import { db, emailClickEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();
const log = logger.child({ component: "click-tracking" });

const FALLBACK =
  process.env.MARKETING_SITE_URL ??
  process.env.PLATFORM_HOMEPAGE_URL ??
  "https://app.propsite.io";

/**
 * GET /api/t/:token
 *
 * Public redirect endpoint for tracked email links.
 * - Looks up the token in email_click_events.
 * - Stamps clicked_at on the first click only.
 * - 302-redirects to the destination URL.
 * - Falls back to the marketing homepage if the token is unknown.
 *
 * Admin spot-check bypass:
 * - Append ?notrack=<ADMIN_PASSWORD> to skip recording the click.
 *   The redirect still works but clicked_at is never stamped, so
 *   dashboard metrics are unaffected.
 */
router.get("/t/:token", async (req, res) => {
  const token = String(req.params.token);
  const adminPassword = process.env.ADMIN_PASSWORD;
  const notrack =
    adminPassword &&
    String(req.query.notrack ?? "") === adminPassword;

  try {
    const rows = await db
      .select()
      .from(emailClickEventsTable)
      .where(eq(emailClickEventsTable.token, token))
      .limit(1);

    const row = rows[0];

    if (!row) {
      log.warn({ token }, "Unknown click tracking token — redirecting to fallback");
      res.redirect(302, FALLBACK);
      return;
    }

    if (notrack) {
      log.info(
        { token, agentEmail: row.agentEmail, listingId: row.listingId, linkType: row.linkType },
        "Admin spot-check — click not recorded",
      );
      res.redirect(302, row.destinationUrl);
      return;
    }

    // Stamp first click only — subsequent visits don't overwrite.
    if (!row.clickedAt) {
      await db
        .update(emailClickEventsTable)
        .set({ clickedAt: new Date() })
        .where(eq(emailClickEventsTable.token, token));

      log.info(
        { token, agentEmail: row.agentEmail, listingId: row.listingId, linkType: row.linkType },
        "Email link clicked",
      );
    }

    res.redirect(302, row.destinationUrl);
  } catch (err) {
    log.error({ err, token }, "Click tracking error — falling back to destination or homepage");
    res.redirect(302, FALLBACK);
  }
});

export default router;

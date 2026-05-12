import app from "./app";
import { logger } from "./lib/logger";
import { startMlsIngestion } from "./lib/mls/cron";
import { initBillingLifecycleBridge } from "./lib/billing/lifecycleBridge";
import { initColdOutreachBridge } from "./lib/outreach/coldOutreach";
import { startEmailOutboxWorker } from "./lib/outbox/email";
import { startSmsOutboxWorker } from "./lib/outbox/sms";
import { startWeeklyReportCron } from "./lib/analytics/cron";
import { startColdOutreachFollowupCron } from "./lib/outreach/followupCron";
import { startPurgeUnclaimedCron } from "./lib/mls/purgeCron";
import { startDailyOutreachReportCron } from "./lib/outreach/dailyReportCron";
import { seedClickEvents } from "./lib/seeds/seedClickEvents.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Outbox drain and outreach crons must only run in the deployed production
 * environment.  Running them in dev causes real emails to be sent with
 * tracking tokens stored in the dev database — those tokens are unknown to
 * the production server, so every recipient sees a broken tracking link.
 *
 * Replit sets REPL_DEPLOYMENT to a non-empty string in all autoscale
 * deployments; it is absent (undefined) in the development workspace.
 */
const isProduction = Boolean(process.env["REPL_DEPLOYMENT"]);

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, isProduction }, "Server listening");

  // Seed missing click events on every boot so that tracking links from
  // previously dev-drained emails resolve correctly in production.
  await seedClickEvents();

  initBillingLifecycleBridge();
  initColdOutreachBridge();
  startWeeklyReportCron();
  startPurgeUnclaimedCron();
  startMlsIngestion();

  if (isProduction) {
    startEmailOutboxWorker();
    startSmsOutboxWorker();
    startColdOutreachFollowupCron();
    startDailyOutreachReportCron();
    logger.info("Outbox drain and outreach crons started (production)");
  } else {
    logger.warn(
      "Outbox drain disabled in dev — REPL_DEPLOYMENT not set",
    );
  }
});

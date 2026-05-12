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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  initBillingLifecycleBridge();
  initColdOutreachBridge();
  startEmailOutboxWorker();
  startSmsOutboxWorker();
  startWeeklyReportCron();
  startColdOutreachFollowupCron();
  startPurgeUnclaimedCron();
  startDailyOutreachReportCron();
  startMlsIngestion();
});

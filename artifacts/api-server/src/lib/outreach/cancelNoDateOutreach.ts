import { db, emailOutboxTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../logger.js";

const log = logger.child({ component: "cancel-no-date-outreach" });

/**
 * One-time startup cleanup: cancel all pending cold_outreach outbox rows.
 *
 * These rows were queued by the initial bulk MLS sync before the
 * mls_list_date-required gate was introduced. Nearly all lack a verified
 * on-market date and should not be sent. The code gates in
 * onListingUpserted and shouldCancelColdOutreach enforce the requirement
 * going forward; this function fast-cancels the backlog so we don't
 * spend drain cycles processing them one-at-a-time.
 *
 * Uses a single raw SQL UPDATE (same connection path as the drain worker)
 * with a statement timeout to avoid hanging the connection pool.
 */
export async function cancelColdOutreachWithNoDate(): Promise<void> {
  log.info("Starting one-time cleanup: cancelling all pending cold outreach rows");
  try {
    // Set a generous statement timeout so this never hangs the pool.
    await db.execute(sql`SET LOCAL statement_timeout = '120s'`);
    const result = await db.execute<{ count: string }>(sql`
      WITH cancelled AS (
        UPDATE ${emailOutboxTable}
           SET status = 'cancelled',
               last_error = 'listing_no_date',
               updated_at = NOW()
         WHERE kind = 'cold_outreach'
           AND status = 'pending'
         RETURNING id
      )
      SELECT count(*) AS count FROM cancelled
    `);
    const rows =
      (result as unknown as { rows: Array<{ count: string }> }).rows ??
      (result as unknown as Array<{ count: string }>);
    const totalCancelled = parseInt(rows[0]?.count ?? "0", 10);
    log.info({ totalCancelled }, "One-time cleanup complete");
  } catch (err) {
    log.error({ err }, "One-time cleanup failed — pending rows will be cancelled at drain time via shouldCancelColdOutreach");
  }
}

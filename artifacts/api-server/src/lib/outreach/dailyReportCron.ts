import { db, emailOutboxTable, listingsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { sendEmail } from "../email.js";
import { logger } from "../logger.js";

const log = logger.child({ component: "daily-outreach-report" });

const REPORT_TO = "fgrant@forrestgrealty.com";
const REPORT_HOUR_ET = 10;

interface ReportRow {
  agentName: string;
  agentEmail: string;
  address: string;
  listingId: string;
}

function buildCsv(rows: ReportRow[]): string {
  const header = "Agent Name,Agent Email,Property Address,Listing ID";
  const body = rows.map((r) =>
    [r.agentName, r.agentEmail, r.address, r.listingId]
      .map((v) => `"${v.replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...body].join("\r\n");
}

function buildHtmlTable(rows: ReportRow[], dateLabel: string): string {
  const rowsHtml = rows
    .map(
      (r) => `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${r.agentName}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${r.agentEmail}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${r.address}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:11px;">${r.listingId}</td>
    </tr>`,
    )
    .join("");
  return `
    <p style="font-family:sans-serif;font-size:14px;">Cold outreach sent on <strong>${dateLabel}</strong>: <strong>${rows.length}</strong> email${rows.length !== 1 ? "s" : ""}.</p>
    ${
      rows.length === 0
        ? `<p style="font-family:sans-serif;font-size:14px;color:#6b7280;">No cold outreach emails were sent today.</p>`
        : `<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;width:100%;max-width:800px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Agent Name</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Agent Email</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Property Address</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Listing ID</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>`
    }
    <p style="font-family:sans-serif;font-size:12px;color:#9ca3af;margin-top:24px;">— PropSite Team</p>
  `;
}

async function runOneTick(now: Date = new Date()): Promise<void> {
  // Only fire at the 10 AM ET hour
  const etHour = parseInt(
    now.toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }),
    10,
  );
  if (etHour !== REPORT_HOUR_ET) return;

  const todayET = now.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dedupeKey = `cold_outreach_daily_report:${todayET}`;

  // Idempotent: skip if already sent today
  const existing = await db
    .select({ id: emailOutboxTable.id })
    .from(emailOutboxTable)
    .where(and(eq(emailOutboxTable.dedupeKey, dedupeKey)))
    .limit(1);
  if (existing.length > 0) return;

  // Query all cold_outreach emails sent today (ET), join to listings for agent info
  const rawRows = await db.execute<{
    listing_id: string;
    address: string;
    agent_name: string | null;
    agent_email: string | null;
  }>(sql`
    SELECT
      (o.metadata->>'listingId') AS listing_id,
      l.address,
      l.list_agent_name AS agent_name,
      l.list_agent_email AS agent_email
    FROM ${emailOutboxTable} o
    LEFT JOIN ${listingsTable} l
      ON l.id = (o.metadata->>'listingId')::uuid
    WHERE o.kind = 'cold_outreach'
      AND o.status = 'sent'
      AND DATE(o.sent_at AT TIME ZONE 'America/New_York')
          = (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date
      AND o.metadata->>'listingId' IS NOT NULL
    ORDER BY o.sent_at ASC
  `);

  const rows: ReportRow[] = (
    (rawRows as unknown as { rows?: typeof rawRows } & typeof rawRows).rows ??
    rawRows
  ).map((r) => ({
    agentName: r.agent_name ?? "Unknown",
    agentEmail: r.agent_email ?? "Unknown",
    address: r.address ?? "Unknown",
    listingId: r.listing_id ?? "Unknown",
  }));

  const csv = buildCsv(rows);
  const html = buildHtmlTable(rows, todayET);

  try {
    await sendEmail({
      to: REPORT_TO,
      subject: `Cold Outreach Daily Report — ${todayET}`,
      html,
      text: csv,
    });

    // Record in outbox for deduplication (status=sent, skip the worker)
    await db.insert(emailOutboxTable).values({
      toEmail: REPORT_TO,
      subject: `Cold Outreach Daily Report — ${todayET}`,
      html,
      textBody: csv,
      kind: "transactional",
      dedupeKey,
      status: "sent",
      sentAt: now,
      sendAfter: now,
      metadata: { reportDate: todayET, rowCount: rows.length },
    });

    log.info({ date: todayET, rowCount: rows.length }, "Daily cold outreach report sent");
  } catch (err) {
    log.error({ err, date: todayET }, "Failed to send daily cold outreach report");
  }
}

let timer: NodeJS.Timeout | null = null;

export function startDailyOutreachReportCron(): void {
  if (timer) return;
  const intervalMs = Number(process.env.DAILY_REPORT_TICK_MS ?? 15 * 60 * 1000);
  const tick = () =>
    runOneTick().catch((err) => log.error({ err }, "Daily report tick errored"));
  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  log.info({ intervalMs, reportTo: REPORT_TO }, "Daily outreach report cron started");
  void tick();
}

export function stopDailyOutreachReportCron(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

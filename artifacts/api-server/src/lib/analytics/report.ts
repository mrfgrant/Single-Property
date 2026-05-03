import type { WeeklyStats, FinalMarketingStats } from "./aggregate.js";

/**
 * Pure rendering helpers for the weekly seller report and the
 * close-of-listing marketing summary. No DB or provider calls — these
 * just produce an EmailPayload-ish shape the outbox can consume.
 *
 * Both layouts are deliberately conservative HTML — Outlook 2019 and
 * Apple Mail render this without any client-specific quirks, and the
 * seller never logs in so the email IS the product surface.
 */

export interface WeeklyReportEmailParams {
  toEmail: string;
  ccEmail?: string | null;
  recipientName: string;
  isAgentOnly: boolean;
  address: string;
  domainName: string | null;
  agentFirstName: string;
  agentLastName: string;
  agentEmail: string;
  agentPhone: string | null;
  agentHeadshotUrl: string | null;
  brokerage: string | null;
  stats: WeeklyStats;
  narrative: string;
}

export interface RenderedEmail {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text: string;
}

const FRIENDLY_SOURCE: Record<string, string> = {
  direct: "Direct",
  google: "Google",
  facebook: "Facebook",
  instagram: "Instagram",
  qr: "QR code",
  other: "Other",
};

function fmtSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
}

function fmtRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const a = start.toLocaleDateString("en-US", opts);
  const b = new Date(end.getTime() - 1).toLocaleDateString("en-US", opts);
  return `${a} – ${b}`;
}

function statBlock(label: string, value: string, sub?: string): string {
  return `
    <td style="padding:14px;text-align:center;border:1px solid #e5e7eb;background:#fafaf7;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:4px;">${label}</div>
      <div style="font-size:22px;font-weight:600;color:#0d1b2a;font-family:Georgia,serif;">${value}</div>
      ${sub ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${sub}</div>` : ""}
    </td>
  `;
}

function sourceTable(breakdown: Record<string, number>, top: string): string {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  if (total === 0) return "";
  const rows = Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => {
      const pct = Math.round((n / total) * 100);
      const label = FRIENDLY_SOURCE[k] ?? k;
      const bold = k === top ? "font-weight:600;" : "";
      return `<tr>
        <td style="padding:6px 0;color:#0d1b2a;${bold}">${label}</td>
        <td style="padding:6px 0;text-align:right;color:#0d1b2a;${bold}">${n} (${pct}%)</td>
      </tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">${rows}</table>`;
}

function agentFooter(p: WeeklyReportEmailParams): string {
  const headshot = p.agentHeadshotUrl
    ? `<img src="${p.agentHeadshotUrl}" alt="" width="56" height="56" style="border-radius:50%;display:block;"/>`
    : "";
  const phone = p.agentPhone
    ? `<div><a href="tel:${p.agentPhone}" style="color:#0d1b2a;text-decoration:none;">${p.agentPhone}</a></div>`
    : "";
  const brokerage = p.brokerage
    ? `<div style="color:#6b7280;font-size:12px;margin-top:2px;">${p.brokerage}</div>`
    : "";
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
      <tr>
        <td style="padding-right:14px;vertical-align:middle;width:64px;">${headshot}</td>
        <td style="vertical-align:middle;font-size:13px;color:#0d1b2a;">
          <div style="font-weight:600;">${p.agentFirstName} ${p.agentLastName}</div>
          ${brokerage}
          <div style="margin-top:4px;"><a href="mailto:${p.agentEmail}" style="color:#0d1b2a;text-decoration:none;">${p.agentEmail}</a></div>
          ${phone}
        </td>
      </tr>
    </table>
  `;
}

export function renderWeeklySellerReport(p: WeeklyReportEmailParams): RenderedEmail {
  const range = fmtRange(p.stats.weekStart, p.stats.weekEnd);
  const greeting = p.isAgentOnly
    ? `Hi ${p.agentFirstName},`
    : `Hi ${p.recipientName.split(" ")[0] ?? p.recipientName},`;
  const intro = p.isAgentOnly
    ? `Here's the weekly traffic report for <strong>${p.address}</strong> (no seller email on file yet — this is a copy for your records).`
    : `Here's this week's update on <strong>${p.address}</strong>.`;

  const liveUrl = p.domainName ? `https://${p.domainName}` : null;
  const linkLine = liveUrl
    ? `<p style="margin:0 0 24px;color:#6b7280;font-size:13px;"><a href="${liveUrl}" style="color:#c9a84c;text-decoration:none;">${p.domainName}</a> · ${range}</p>`
    : `<p style="margin:0 0 24px;color:#6b7280;font-size:13px;">${range}</p>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f5ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table style="width:100%;border-collapse:collapse;background:#f7f5ef;">
    <tr><td style="padding:32px 16px;">
      <table style="max-width:600px;margin:0 auto;background:#ffffff;border-collapse:collapse;border-radius:6px;overflow:hidden;">
        <tr><td style="padding:32px 32px 24px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9a84c;">Weekly report</p>
          <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-size:24px;color:#0d1b2a;font-weight:500;">${p.address}</h1>
          ${linkLine}
          <p style="margin:0 0 8px;color:#0d1b2a;font-size:15px;">${greeting}</p>
          <p style="margin:0 0 20px;color:#0d1b2a;font-size:15px;line-height:1.5;">${intro}</p>
          <p style="margin:0 0 24px;padding:14px 16px;background:#f7f5ef;border-left:3px solid #c9a84c;color:#0d1b2a;font-size:15px;line-height:1.55;">${p.narrative}</p>

          <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
            <tr>
              ${statBlock("Visits", String(p.stats.visits))}
              ${statBlock("Unique visitors", String(p.stats.uniqueVisitors))}
            </tr>
            <tr>
              ${statBlock("Avg time", fmtSeconds(p.stats.avgTimeOnPageSec))}
              ${statBlock("Mobile", `${p.stats.pctMobile}%`)}
            </tr>
            <tr>
              ${statBlock("Inquiries", String(p.stats.leads))}
              ${statBlock("Total views", String(p.stats.cumulativeViews), "since launch")}
            </tr>
          </table>

          <p style="margin:24px 0 4px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">Where visitors came from</p>
          ${sourceTable(p.stats.sourceBreakdown, p.stats.topSource)}

          ${agentFooter(p)}

          <p style="margin:32px 0 0;font-size:11px;color:#9ca3af;text-align:center;">
            You're receiving this because ${p.isAgentOnly ? "you are the listing agent" : "your home is listed with " + p.agentFirstName + " " + p.agentLastName} on PropSite.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `${greeting}

${p.narrative}

This week (${range}) on ${p.address}:
  Visits: ${p.stats.visits}
  Unique visitors: ${p.stats.uniqueVisitors}
  Avg time on page: ${fmtSeconds(p.stats.avgTimeOnPageSec)}
  Mobile: ${p.stats.pctMobile}%
  Inquiries: ${p.stats.leads}
  Total views since launch: ${p.stats.cumulativeViews}

Top traffic source: ${FRIENDLY_SOURCE[p.stats.topSource] ?? p.stats.topSource}

— ${p.agentFirstName} ${p.agentLastName}${p.brokerage ? ", " + p.brokerage : ""}
${p.agentEmail}${p.agentPhone ? "\n" + p.agentPhone : ""}`;

  return {
    to: p.toEmail,
    cc: p.ccEmail ?? undefined,
    subject: `Weekly traffic report — ${p.address}`,
    html,
    text,
  };
}

export interface FinalReportEmailParams {
  toEmail: string;
  ccEmail?: string | null;
  recipientName: string;
  isAgentOnly: boolean;
  address: string;
  closeStatus: "Sold" | "Withdrawn" | "Expired";
  agentFirstName: string;
  agentLastName: string;
  agentEmail: string;
  agentPhone: string | null;
  agentHeadshotUrl: string | null;
  brokerage: string | null;
  stats: FinalMarketingStats;
}

export function renderFinalMarketingReport(p: FinalReportEmailParams): RenderedEmail {
  const verb =
    p.closeStatus === "Sold"
      ? "sold"
      : p.closeStatus === "Withdrawn"
        ? "withdrawn"
        : "expired";
  const subjectTag =
    p.closeStatus === "Sold" ? "[SOLD]" : `[${p.closeStatus.toUpperCase()}]`;

  const greeting = p.isAgentOnly
    ? `Hi ${p.agentFirstName},`
    : `Hi ${p.recipientName.split(" ")[0] ?? p.recipientName},`;

  const opener =
    p.closeStatus === "Sold"
      ? `Congratulations — <strong>${p.address}</strong> sold. Here's the final marketing summary for the property's website.`
      : `<strong>${p.address}</strong> has been ${verb}. Here's the final marketing summary for the property's website.`;

  const dateOpts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f5ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table style="width:100%;border-collapse:collapse;background:#f7f5ef;">
    <tr><td style="padding:32px 16px;">
      <table style="max-width:600px;margin:0 auto;background:#ffffff;border-collapse:collapse;border-radius:6px;overflow:hidden;">
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9a84c;">Marketing summary</p>
          <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:24px;color:#0d1b2a;font-weight:500;">${p.address}</h1>
          <p style="margin:0 0 8px;color:#0d1b2a;font-size:15px;">${greeting}</p>
          <p style="margin:0 0 24px;color:#0d1b2a;font-size:15px;line-height:1.5;">${opener}</p>

          <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
            <tr>
              ${statBlock("Total views", String(p.stats.totalViews))}
              ${statBlock("Total leads", String(p.stats.totalLeads))}
            </tr>
            <tr>
              ${statBlock("Days on market", String(p.stats.daysOnMarket))}
              ${statBlock("Status", p.closeStatus)}
            </tr>
          </table>

          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#0d1b2a;">
            <tr><td style="padding:6px 0;color:#6b7280;">Date listed</td><td style="padding:6px 0;text-align:right;">${p.stats.dateListed.toLocaleDateString("en-US", dateOpts)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Date ${verb}</td><td style="padding:6px 0;text-align:right;">${p.stats.dateClosed.toLocaleDateString("en-US", dateOpts)}</td></tr>
          </table>

          ${agentFooter({
            ...p,
            stats: { ...p.stats, weekStart: p.stats.dateClosed, weekEnd: p.stats.dateClosed, visits: 0, uniqueVisitors: 0, avgTimeOnPageSec: 0, pctMobile: 0, topSource: "direct", sourceBreakdown: {}, leads: 0, cumulativeViews: p.stats.totalViews, prevWeekVisits: 0, prevWeekLeads: 0 },
            narrative: "",
            domainName: null,
          } as WeeklyReportEmailParams)}

          <p style="margin:24px 0 0;font-size:11px;color:#9ca3af;text-align:center;">
            This is the final automated update for this listing.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `${greeting}

${p.address} has been ${verb}.

Final summary:
  Total views: ${p.stats.totalViews}
  Total leads: ${p.stats.totalLeads}
  Days on market: ${p.stats.daysOnMarket}
  Date listed: ${p.stats.dateListed.toLocaleDateString("en-US", dateOpts)}
  Date ${verb}: ${p.stats.dateClosed.toLocaleDateString("en-US", dateOpts)}

— ${p.agentFirstName} ${p.agentLastName}${p.brokerage ? ", " + p.brokerage : ""}
${p.agentEmail}${p.agentPhone ? "\n" + p.agentPhone : ""}`;

  return {
    to: p.toEmail,
    cc: p.ccEmail ?? undefined,
    subject: `Marketing summary — ${p.address} ${subjectTag}`,
    html,
    text,
  };
}

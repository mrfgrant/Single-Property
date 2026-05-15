import { sendEmail } from "./email.js";
import { logger } from "./logger.js";

const log = logger.child({ component: "operator-alert" });

const OPERATOR_EMAIL = () => process.env.OPERATOR_ALERT_EMAIL ?? null;

const COOLDOWN_MS = 60 * 60 * 1000;
const lastSent = new Map<string, number>();

function isOnCooldown(type: string): boolean {
  const last = lastSent.get(type);
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

function markSent(type: string): void {
  lastSent.set(type, Date.now());
}

function buildHtml(subject: string, lines: string[]): string {
  const rows = lines
    .map((l) => `<tr><td style="padding:6px 0;font-size:14px;color:#0d1b2a;font-family:monospace;white-space:pre-wrap;">${l}</td></tr>`)
    .join("");
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f5ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table style="width:100%;border-collapse:collapse;background:#f7f5ef;">
    <tr><td style="padding:32px 16px;">
      <table style="max-width:600px;margin:0 auto;background:#fff;border-collapse:collapse;border-radius:6px;overflow:hidden;">
        <tr><td style="padding:24px 32px 8px;">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c0392b;">PropSite System Alert</p>
          <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:20px;color:#0d1b2a;font-weight:500;">${subject}</h1>
          <table style="width:100%;border-collapse:collapse;background:#fafaf7;border:1px solid #e5e7eb;border-radius:4px;padding:12px;">
            ${rows}
          </table>
          <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">
            Sent by PropSite API · ${new Date().toISOString()}<br/>
            Alerts are rate-limited to once per hour per condition.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Send an operator alert email for a named condition.
 * Rate-limited to once per hour per `type` key.
 * No-op when OPERATOR_ALERT_EMAIL is not set.
 */
export async function sendOperatorAlert(
  type: string,
  subject: string,
  lines: string[],
): Promise<void> {
  const to = OPERATOR_EMAIL();
  if (!to) {
    log.debug({ type }, "OPERATOR_ALERT_EMAIL not set — skipping alert");
    return;
  }
  if (isOnCooldown(type)) {
    log.debug({ type }, "Operator alert suppressed — on cooldown");
    return;
  }
  markSent(type);
  const text = `PropSite System Alert: ${subject}\n\n${lines.join("\n")}\n\n${new Date().toISOString()}`;
  try {
    await sendEmail({
      to,
      subject: `[PropSite Alert] ${subject}`,
      html: buildHtml(subject, lines),
      text,
    });
    log.warn({ type, to, subject }, "Operator alert sent");
  } catch (err) {
    log.error({ err, type, subject }, "Failed to send operator alert");
  }
}

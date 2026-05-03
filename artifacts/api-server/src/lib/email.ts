import { logger } from "./logger.js";

const FROM_EMAIL = process.env.EMAIL_FROM ?? "noreply@reply.soracle.dev";
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? "PropSite";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

interface EmailPayload {
  to: string;
  cc?: string | null;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  providerMessageId?: string;
}

async function sendViaResend(payload: EmailPayload): Promise<SendEmailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [payload.to],
      ...(payload.cc ? { cc: [payload.cc] } : {}),
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { providerMessageId: json.id };
}

async function sendViaSendGrid(payload: EmailPayload): Promise<SendEmailResult> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: payload.to }],
        ...(payload.cc ? { cc: [{ email: payload.cc }] } : {}),
      }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: payload.subject,
      content: [
        { type: "text/html", value: payload.html },
        ...(payload.text ? [{ type: "text/plain", value: payload.text }] : []),
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SendGrid error ${res.status}: ${body}`);
  }
  return { providerMessageId: res.headers.get("x-message-id") ?? undefined };
}

export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  if (RESEND_API_KEY) return sendViaResend(payload);
  if (SENDGRID_API_KEY) return sendViaSendGrid(payload);
  logger.warn({ to: payload.to, subject: payload.subject }, "No email provider configured — skipping send (set RESEND_API_KEY or SENDGRID_API_KEY)");
  return {};
}

const FOOTER_HTML = `<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px;"/>
<p style="color:#5d6577;font-size:12px;line-height:1.5;">
  PropSite — built for CSRA real estate professionals.<br/>
  You're receiving this because your name was on a recently-listed CSRA-area property.
  <a href="{{UNSUBSCRIBE_URL}}" style="color:#5d6577;">Unsubscribe with one click</a>.
</p>`;

function withFooter(html: string, unsubscribeUrl: string): string {
  return html + FOOTER_HTML.replace("{{UNSUBSCRIBE_URL}}", unsubscribeUrl);
}

export function previewReadyEmail(params: {
  agentEmail: string;
  agentFirstName: string;
  address: string;
  previewUrl: string;
  activateUrl: string;
}): EmailPayload {
  return {
    to: params.agentEmail,
    subject: `We built you a website for ${params.address}`,
    html: `
      <p>Hi ${params.agentFirstName},</p>
      <p>We noticed your new listing at <strong>${params.address}</strong> hit the MLS — so we went ahead and built you a full property website for it. No charge for the preview.</p>
      <p><a href="${params.previewUrl}" style="display:inline-block;padding:12px 24px;background:#c9a84c;color:#fff;font-weight:600;text-decoration:none;border-radius:9999px;">View your free preview →</a></p>
      <p>Includes MLS photos, mortgage calculator, walk/school scores, and instant lead capture. Mobile-optimized, ready to share.</p>
      <p>If you'd like to keep it live (and have us do this automatically every time you list), it's <strong>$49/mo per active listing</strong> — billing stops the day the listing closes.</p>
      <p><a href="${params.activateUrl}">Activate this site →</a></p>
      <p>Either way, the preview is yours to share. Reply if you have any questions.</p>
      <p>— The PropSite Team<br/><em style="color:#5d6577;font-size:12px;">CSRA's Property Site Engine</em></p>
    `,
    text: `Hi ${params.agentFirstName}, we built you a free property website for ${params.address}: ${params.previewUrl}. Activate it permanently for $49/mo: ${params.activateUrl}`,
  };
}

export function welcomeEmail(agent: { firstName: string; email: string }): EmailPayload {
  return {
    to: agent.email,
    subject: "Welcome to PropSite — your listing sites are ready",
    html: `
      <p>Hi ${agent.firstName},</p>
      <p>Welcome to PropSite! You're all set. When your next listing goes live in the MLS, we'll automatically build a property website for it and notify you.</p>
      <p>Each site is built in minutes and published at a dedicated address domain like <strong>412magnolia.com</strong>.</p>
      <p>Questions? Reply to this email anytime.</p>
      <p>— The PropSite Team</p>
    `,
    text: `Hi ${agent.firstName}, welcome to PropSite! Your listing sites will be ready automatically when your MLS listings go live.`,
  };
}

export function siteLiveEmail(params: {
  agentEmail: string;
  agentFirstName: string;
  address: string;
  domainName: string;
  sellerEmailCollectionUrl: string;
}): EmailPayload {
  return {
    to: params.agentEmail,
    subject: `Your PropSite for ${params.address} is live`,
    html: `
      <p>Hi ${params.agentFirstName},</p>
      <p>Your property site for <strong>${params.address}</strong> is now live at:</p>
      <p><a href="https://${params.domainName}">https://${params.domainName}</a></p>
      <p>Share this link with your sellers and on social media. Lead inquiries will go straight to your email.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p><strong>One more step — add your seller's email.</strong></p>
      <p>We'll send them a friendly weekly traffic + activity report so they can see what's happening with their listing. (You'll be CC'd.)</p>
      <p><a href="${params.sellerEmailCollectionUrl}" style="display:inline-block;padding:10px 16px;background:#0d1b2a;color:#fff;text-decoration:none;border-radius:6px;">Add seller's email →</a></p>
      <p>— The PropSite Team</p>
    `,
    text: `Your PropSite for ${params.address} is live at https://${params.domainName}\n\nAdd your seller's email so we can send them a weekly report: ${params.sellerEmailCollectionUrl}`,
  };
}

export function paymentFailedEmail(params: {
  agentEmail: string;
  agentFirstName: string;
  address: string;
  portalUrl: string;
}): EmailPayload {
  return {
    to: params.agentEmail,
    subject: `Action required: payment failed for ${params.address}`,
    html: `
      <p>Hi ${params.agentFirstName},</p>
      <p>We were unable to charge your card for your PropSite subscription for <strong>${params.address}</strong>.</p>
      <p><strong>Your site will be taken offline in 5 days</strong> if payment is not resolved.</p>
      <p><a href="${params.portalUrl}">Update your payment method →</a></p>
      <p>Once your card is updated, we'll retry the charge and your site will continue running without interruption.</p>
      <p>— The PropSite Team</p>
    `,
    text: `Payment failed for ${params.address}. Update your card within 5 days to keep your site live: ${params.portalUrl}`,
  };
}

/**
 * Buyer-lead alert sent to the listing agent when a lead is captured on
 * a live property site. Includes click-to-call/email and a thumbnail.
 */
export function leadAlertEmail(params: {
  agentEmail: string;
  agentFirstName: string;
  address: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  message: string | null;
  listingPhotoUrl: string | null;
}): EmailPayload {
  const phoneRow = params.buyerPhone
    ? `<tr><td style="padding:6px 0;color:#5d6577;">Phone</td><td><a href="tel:${escapeAttr(params.buyerPhone)}">${escape(params.buyerPhone)}</a></td></tr>`
    : "";
  const messageBlock = params.message
    ? `<p style="margin-top:16px;padding:12px;background:#f7f5ef;border-left:3px solid #c9a84c;">${escape(params.message)}</p>`
    : "";
  const photoBlock = params.listingPhotoUrl
    ? `<img src="${escapeAttr(params.listingPhotoUrl)}" alt="${escapeAttr(params.address)}" style="width:100%;max-width:480px;border-radius:8px;margin-bottom:16px;"/>`
    : "";
  return {
    to: params.agentEmail,
    subject: `New lead for ${params.address}`,
    html: `
      <p>Hi ${escape(params.agentFirstName)},</p>
      <p>You have a new buyer lead on <strong>${escape(params.address)}</strong>:</p>
      ${photoBlock}
      <table style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#5d6577;">Name</td><td>${escape(params.buyerName)}</td></tr>
        <tr><td style="padding:6px 0;color:#5d6577;">Email</td><td><a href="mailto:${escapeAttr(params.buyerEmail)}">${escape(params.buyerEmail)}</a></td></tr>
        ${phoneRow}
        <tr><td style="padding:6px 0;color:#5d6577;">Received</td><td>${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET</td></tr>
      </table>
      ${messageBlock}
      <p style="margin-top:24px;">Reply within 5 minutes for the best conversion.</p>
      <p>— PropSite</p>
    `,
    text: `New lead on ${params.address}\n\n${params.buyerName} <${params.buyerEmail}>${params.buyerPhone ? "  " + params.buyerPhone : ""}\n${params.message ?? ""}`,
  };
}

/**
 * Auto-reply to the buyer confirming we received their inquiry.
 */
export function buyerAutoReplyEmail(params: {
  buyerEmail: string;
  buyerName: string;
  address: string;
}): EmailPayload {
  return {
    to: params.buyerEmail,
    subject: `Thanks — we received your inquiry on ${params.address}`,
    html: `
      <p>Hi ${escape(params.buyerName)},</p>
      <p>Thanks for your interest in <strong>${escape(params.address)}</strong>. The listing agent has been notified and will be in touch shortly — typically within an hour during business hours.</p>
      <p>In the meantime, feel free to revisit the listing site for floor plans, mortgage calculator, and neighborhood info.</p>
      <p>— PropSite, on behalf of the listing agent</p>
    `,
    text: `Thanks for your interest in ${params.address}. The listing agent has been notified and will reach out shortly.`,
  };
}

/**
 * Listing archived notification — sent when MLS status flips Sold/Withdrawn/Expired.
 */
export function listingArchivedEmail(params: {
  agentEmail: string;
  agentFirstName: string;
  address: string;
  closeStatus: string;
}): EmailPayload {
  return {
    to: params.agentEmail,
    subject: `Your PropSite for ${params.address} has been archived (${params.closeStatus})`,
    html: `
      <p>Hi ${escape(params.agentFirstName)},</p>
      <p>Your listing at <strong>${escape(params.address)}</strong> went off-market in the MLS (${escape(params.closeStatus)}), so we've archived your property site and stopped billing.</p>
      <p>If a buyer visits the URL, they'll be redirected to your personal website (or a polite "no longer available" page if you don't have one on file).</p>
      <p>When you have your next listing, we'll automatically build a new site for it. No action needed.</p>
      <p>— PropSite</p>
    `,
    text: `Your PropSite for ${params.address} has been archived (${params.closeStatus}). Billing has stopped. We'll auto-build a site for your next MLS listing.`,
  };
}

/**
 * Cold-outreach Email #1 — sent to a not-yet-customer agent whose new
 * MLS listing we just auto-built a preview for. Single CTA, CAN-SPAM
 * footer with one-click unsubscribe.
 */
export function coldOutreachEmail(params: {
  agentEmail: string;
  agentFirstName: string;
  address: string;
  previewUrl: string;
  activateUrl: string;
  unsubscribeUrl: string;
}): EmailPayload {
  const html = `
      <p>Hi ${escape(params.agentFirstName)},</p>
      <p>I noticed your new listing at <strong>${escape(params.address)}</strong> hit the MLS — so we built you a property website for it. No charge, no signup needed to view.</p>
      <p style="margin:24px 0;">
        <a href="${escapeAttr(params.previewUrl)}" style="display:inline-block;padding:12px 24px;background:#c9a84c;color:#fff;font-weight:600;text-decoration:none;border-radius:9999px;">View your free preview →</a>
      </p>
      <p>It's mobile-optimized, includes MLS photos, mortgage calculator, walk/school scores, and an instant lead-capture form that emails you any inquiry.</p>
      <p>If you'd like to keep it live on a custom domain (and have us auto-build one for every listing going forward), it's <strong>$49/mo per active listing</strong> — billing stops the day the listing closes.</p>
      <p><a href="${escapeAttr(params.activateUrl)}">Activate this site →</a></p>
      <p>Either way, the preview is yours. Reply with any questions.</p>
      <p>— PropSite</p>
    `;
  return {
    to: params.agentEmail,
    subject: `Your site for ${params.address} is ready`,
    html: withFooter(html, params.unsubscribeUrl),
    text: `Hi ${params.agentFirstName}, we built you a property site for ${params.address}: ${params.previewUrl}. Keep it live for $49/mo: ${params.activateUrl}. Unsubscribe: ${params.unsubscribeUrl}`,
  };
}

/**
 * Cold-outreach SMS body. Hard-capped near 160 chars (~1 segment) and
 * always includes "Reply STOP to opt out" per TCPA.
 */
export function coldOutreachSms(params: {
  agentFirstName: string;
  address: string;
  previewUrl: string;
}): string {
  return `${params.agentFirstName}, your listing site for ${params.address} is ready → ${params.previewUrl} (PropSite). Reply STOP to opt out.`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
function escapeAttr(s: string): string {
  return escape(s);
}

export function siteDisabledEmail(params: {
  agentEmail: string;
  agentFirstName: string;
  address: string;
  portalUrl: string;
}): EmailPayload {
  return {
    to: params.agentEmail,
    subject: `Your PropSite for ${params.address} has been paused`,
    html: `
      <p>Hi ${params.agentFirstName},</p>
      <p>Your property site for <strong>${params.address}</strong> has been paused due to a failed payment.</p>
      <p><a href="${params.portalUrl}">Update your payment method to restore your site →</a></p>
      <p>Your site will come back online automatically as soon as payment succeeds.</p>
      <p>— The PropSite Team</p>
    `,
    text: `Your site for ${params.address} is paused. Update your card to restore it: ${params.portalUrl}`,
  };
}

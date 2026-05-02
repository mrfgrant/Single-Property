import { logger } from "./logger.js";

const FROM_EMAIL = process.env.EMAIL_FROM ?? "noreply@propsite.app";
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? "PropSite";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function sendViaResend(payload: EmailPayload): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

async function sendViaSendGrid(payload: EmailPayload): Promise<void> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: payload.to }] }],
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
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (RESEND_API_KEY) {
    await sendViaResend(payload);
    return;
  }
  if (SENDGRID_API_KEY) {
    await sendViaSendGrid(payload);
    return;
  }
  logger.warn({ to: payload.to, subject: payload.subject }, "No email provider configured — skipping send (set RESEND_API_KEY or SENDGRID_API_KEY)");
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
}): EmailPayload {
  return {
    to: params.agentEmail,
    subject: `Your PropSite for ${params.address} is live`,
    html: `
      <p>Hi ${params.agentFirstName},</p>
      <p>Your property site for <strong>${params.address}</strong> is now live at:</p>
      <p><a href="https://${params.domainName}">https://${params.domainName}</a></p>
      <p>Share this link with your sellers and on social media. Lead inquiries will go straight to your email.</p>
      <p>— The PropSite Team</p>
    `,
    text: `Your PropSite for ${params.address} is live at https://${params.domainName}`,
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

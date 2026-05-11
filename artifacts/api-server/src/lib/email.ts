import { logger } from "./logger.js";

const FROM_EMAIL = process.env.EMAIL_FROM ?? "support@mail.propsite.io";
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
 * Suggests a memorable domain from a street address.
 * "2323 Overton Road" → "2323overtonrd.com"
 */
export function suggestDomain(address: string): string {
  const streetPart = address.split(",")[0].trim().toLowerCase();
  const suffixMap: Record<string, string> = {
    road: "rd", street: "st", avenue: "ave", drive: "dr",
    lane: "ln", court: "ct", circle: "cir", boulevard: "blvd",
    place: "pl", way: "way", trail: "trl", terrace: "ter",
    highway: "hwy", parkway: "pkwy", run: "run", ridge: "ridge",
  };
  const shortened = streetPart
    .split(/\s+/)
    .map((w) => suffixMap[w] ?? w)
    .join("")
    .replace(/[^a-z0-9]/g, "");
  return `${shortened}.com`;
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
  photoUrl?: string | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  price?: number | null;
  yearBuilt?: number | null;
  lotAcres?: number | null;
  garage?: boolean | null;
  description?: string | null;
  suggestedDomain?: string | null;
}): EmailPayload {
  const domain = params.suggestedDomain ?? suggestDomain(params.address);
  const priceStr = params.price ? `$${params.price.toLocaleString("en-US")}` : null;
  const specsItems = [
    priceStr,
    params.beds ? `${params.beds} bed` : null,
    params.baths ? `${params.baths} bath` : null,
    params.sqft ? `${params.sqft.toLocaleString()} sq ft` : null,
  ].filter(Boolean);
  const extraSpecs = [
    params.yearBuilt ? `Built ${params.yearBuilt}` : null,
    params.lotAcres ? `${params.lotAcres} acres` : null,
    params.garage ? "Garage" : null,
  ].filter(Boolean);

  const photoBlock = params.photoUrl
    ? `<a href="${escapeAttr(params.previewUrl)}" style="display:block;margin:0 0 20px;">
        <img src="${escapeAttr(params.photoUrl)}" alt="${escapeAttr(params.address)}"
          style="display:block;width:100%;max-width:560px;height:auto;border-radius:6px;"/>
      </a>`
    : "";

  const specsBlock = specsItems.length
    ? `<table style="width:100%;max-width:560px;border-collapse:collapse;margin:0 0 ${extraSpecs.length ? "8px" : "20px"};background:#f9f6f1;border-radius:${extraSpecs.length ? "6px 6px 0 0" : "6px"};overflow:hidden;"><tr>${
        specsItems.map((s, i) => {
          const border = i < specsItems.length - 1 ? "border-right:1px solid #e5ddd0;" : "";
          return `<td style="text-align:center;padding:10px 8px;font-size:14px;font-weight:600;color:#0d1b2a;${border}">${escape(s!)}</td>`;
        }).join("")
      }</tr></table>${extraSpecs.length
        ? `<table style="width:100%;max-width:560px;border-collapse:collapse;margin:0 0 20px;background:#f0ebe3;border-radius:0 0 6px 6px;overflow:hidden;"><tr>${
            extraSpecs.map((s, i) => {
              const border = i < extraSpecs.length - 1 ? "border-right:1px solid #e5ddd0;" : "";
              return `<td style="text-align:center;padding:6px 8px;font-size:12px;color:#555;${border}">${escape(s!)}</td>`;
            }).join("")
          }</tr></table>`
        : ""}`
    : "";

  const domainBlock = `<div style="margin:20px 0;padding:14px 16px;background:#0d1b2a;border-radius:6px;max-width:560px;">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;color:#c9a84c;text-transform:uppercase;">Potential domain we can secure for this listing</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:#fff;font-family:Georgia,serif;">${escape(domain)}</p>
    </div>`;

  const descBlock = params.description
    ? `<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">${escape(
        params.description.length > 280 ? params.description.slice(0, 277) + "…" : params.description
      )}</p>`
    : "";

  const html = `
      <p style="margin:0 0 16px;">Hi ${escape(params.agentFirstName)},</p>
      <p style="margin:0 0 16px;">I saw your listing at <strong>${escape(params.address)}</strong> just hit the market — so we quietly built something for you.</p>
      <p style="margin:0 0 20px;color:#374151;">A dedicated property website that presents the home the way high-end buyers expect: clean, focused, and distraction-free.</p>
      ${photoBlock}
      ${specsBlock}
      ${descBlock}
      <p style="margin:0 0 8px;color:#374151;">Take a look:</p>
      <p style="margin:0 0 24px;">
        <a href="${escapeAttr(params.previewUrl)}" style="display:inline-block;padding:13px 28px;background:#c9a84c;color:#fff;font-weight:700;text-decoration:none;border-radius:9999px;font-size:15px;">View your property website →</a>
      </p>
      <p style="margin:0 0 12px;color:#374151;">Now imagine pairing it with this:</p>
      ${domainBlock}
      <p style="margin:0 0 12px;color:#374151;">A custom domain you can place on your sign rider, brochures, and ads — creating a direct, branded entry point into the property.</p>
      <p style="margin:0 0 20px;color:#374151;">No competing agents. No third-party clutter. Just your listing, your brand, your client.</p>
      <p style="margin:0 0 8px;color:#374151;"><strong>This is the kind of detail that:</strong></p>
      <ul style="margin:0 0 20px;padding-left:20px;color:#374151;line-height:1.9;">
        <li>Signals a higher level of service to sellers</li>
        <li>Positions you above other agents in listing presentations</li>
        <li>Creates a more curated, "luxury" buying experience</li>
        <li>Keeps all inquiries and attention centered on you</li>
      </ul>
      <p style="margin:0 0 16px;color:#374151;">We've already built everything — full-screen gallery, lead capture, and print-ready materials.</p>
      <p style="margin:0 0 20px;color:#374151;">To keep it live on its own domain, it's <strong>$49/month</strong> (and it cancels automatically when the home sells).</p>
      <p style="margin:0 0 8px;color:#374151;">Activate it here:</p>
      <p style="margin:0 0 24px;"><a href="${escapeAttr(params.activateUrl)}" style="color:#0d1b2a;font-weight:600;">Activate your site →</a></p>
      <p style="margin:0 0 16px;color:#374151;">Even if you don't, feel free to use the preview while it's live.</p>
      <p style="margin:0 0 8px;color:#374151;">But if you do — this becomes more than a listing.</p>
      <p style="margin:0 0 20px;color:#374151;">It becomes part of your brand.</p>
      <p style="margin:20px 0 0;">— PropSite</p>
    `;
  return {
    to: params.agentEmail,
    subject: `I saw your listing at ${params.address} just hit the market`,
    html: withFooter(html, params.unsubscribeUrl),
    text: `Hi ${params.agentFirstName},\n\nI saw your listing at ${params.address} just hit the market — so we quietly built something for you.\n\nA dedicated property website that presents the home the way high-end buyers expect: clean, focused, and distraction-free.\n\nTake a look: ${params.previewUrl}\n\nNow imagine pairing it with this: ${domain}\n\nA custom domain you can place on your sign rider, brochures, and ads — creating a direct, branded entry point into the property.\n\nNo competing agents. No third-party clutter. Just your listing, your brand, your client.\n\nThis is the kind of detail that:\n• Signals a higher level of service to sellers\n• Positions you above other agents in listing presentations\n• Creates a more curated, "luxury" buying experience\n• Keeps all inquiries and attention centered on you\n\nWe've already built everything — full-screen gallery, lead capture, and print-ready materials.\n\nTo keep it live on its own domain, it's $49/month (and it cancels automatically when the home sells).\n\nActivate it here: ${params.activateUrl}\n\nEven if you don't, feel free to use the preview while it's live.\n\nBut if you do — this becomes more than a listing. It becomes part of your brand.\n\n— PropSite\n\nUnsubscribe: ${params.unsubscribeUrl}`,
  };
}

/**
 * Cold-outreach Digest — one email summarising 1+ new preview sites
 * for the same agent (e.g. an agent who lists 3 properties the same
 * night). Built so the single-listing case still reads naturally.
 */
export function coldOutreachDigestEmail(params: {
  agentEmail: string;
  agentFirstName: string;
  listings: Array<{
    address: string;
    previewUrl: string;
    activateUrl: string;
    photoUrl: string | null;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
    price?: number | null;
    yearBuilt?: number | null;
    lotAcres?: number | null;
    garage?: boolean | null;
    description?: string | null;
  }>;
  unsubscribeUrl: string;
}): EmailPayload {
  const count = params.listings.length;
  const firstListing = params.listings[0]!;
  const firstDomain = suggestDomain(firstListing.address);

  const subject =
    count === 1
      ? `I saw your listing at ${firstListing.address} just hit the market`
      : `I saw your ${count} new listings just hit the market`;

  const cardsHtml = params.listings
    .map((l) => {
      const domain = suggestDomain(l.address);
      const priceStr = l.price ? `$${l.price.toLocaleString("en-US")}` : null;
      const specs = [
        priceStr,
        l.beds ? `${l.beds} bed` : null,
        l.baths ? `${l.baths} bath` : null,
        l.sqft ? `${l.sqft.toLocaleString()} sq ft` : null,
      ].filter(Boolean);
      const extra = [
        l.yearBuilt ? `Built ${l.yearBuilt}` : null,
        l.lotAcres ? `${l.lotAcres} acres` : null,
        l.garage ? "Garage" : null,
      ].filter(Boolean);
      const photo = l.photoUrl
        ? `<a href="${escapeAttr(l.previewUrl)}" style="display:block;margin-bottom:12px;">
            <img src="${escapeAttr(l.photoUrl)}" alt="${escapeAttr(l.address)}" style="display:block;width:100%;border-radius:6px;"/>
           </a>`
        : "";
      const specsRow = specs.length
        ? `<table style="width:100%;border-collapse:collapse;margin:0 0 ${extra.length ? "4px" : "12px"};background:#f9f6f1;border-radius:${extra.length ? "4px 4px 0 0" : "4px"};"><tr>${
            specs.map((s, i) => {
              const border = i < specs.length - 1 ? "border-right:1px solid #e5ddd0;" : "";
              return `<td style="text-align:center;padding:8px 6px;font-size:13px;font-weight:600;color:#0d1b2a;${border}">${escape(s!)}</td>`;
            }).join("")
          }</tr></table>${extra.length
            ? `<table style="width:100%;border-collapse:collapse;margin:0 0 12px;background:#f0ebe3;border-radius:0 0 4px 4px;"><tr>${
                extra.map((s, i) => {
                  const border = i < extra.length - 1 ? "border-right:1px solid #e5ddd0;" : "";
                  return `<td style="text-align:center;padding:5px 6px;font-size:11px;color:#555;${border}">${escape(s!)}</td>`;
                }).join("")
              }</tr></table>` : ""}`
        : "";
      const descSnippet = l.description
        ? `<p style="margin:0 0 10px;font-size:12px;color:#555;line-height:1.6;">${escape(
            l.description.length > 160 ? l.description.slice(0, 157) + "…" : l.description
          )}</p>`
        : "";
      return `
        <div style="margin:24px 0;padding:16px;border:1px solid #e5e7eb;border-radius:10px;">
          ${photo}
          <p style="margin:0 0 6px;font:600 16px/1.3 system-ui;">${escape(l.address)}</p>
          ${specsRow}
          ${descSnippet}
          <p style="margin:0 0 8px;color:#374151;font-size:14px;">Take a look:</p>
          <p style="margin:0 0 16px;">
            <a href="${escapeAttr(l.previewUrl)}" style="display:inline-block;padding:10px 18px;background:#c9a84c;color:#fff;font-weight:600;text-decoration:none;border-radius:9999px;">View your property website →</a>
          </p>
          <p style="margin:0 0 8px;color:#374151;font-size:14px;">Now imagine pairing it with this:</p>
          <div style="margin:0 0 12px;padding:10px 12px;background:#0d1b2a;border-radius:4px;">
            <p style="margin:0 0 2px;font-size:10px;letter-spacing:0.08em;color:#c9a84c;text-transform:uppercase;">Potential domain</p>
            <p style="margin:0;font-size:16px;font-weight:700;color:#fff;font-family:Georgia,serif;">${escape(domain)}</p>
          </div>
          <p style="margin:0 0 12px;color:#374151;font-size:14px;">Activate it here: <a href="${escapeAttr(l.activateUrl)}" style="color:#0d1b2a;font-weight:600;">Activate your site →</a></p>
        </div>`;
    })
    .join("");

  const intro =
    count === 1
      ? `<p style="margin:0 0 16px;">I saw your listing at <strong>${escape(firstListing.address)}</strong> just hit the market — so we quietly built something for you.</p>
         <p style="margin:0 0 20px;color:#374151;">A dedicated property website that presents the home the way high-end buyers expect: clean, focused, and distraction-free.</p>`
      : `<p style="margin:0 0 16px;">I saw <strong>${count} new listings</strong> from you just hit the market — so we quietly built something for each one.</p>
         <p style="margin:0 0 20px;color:#374151;">Dedicated property websites that present each home the way high-end buyers expect: clean, focused, and distraction-free.</p>`;

  const html = `
      <p style="margin:0 0 16px;">Hi ${escape(params.agentFirstName)},</p>
      ${intro}
      ${cardsHtml}
      <p style="margin:20px 0 8px;color:#374151;">A custom domain you can place on your sign rider, brochures, and ads — creating a direct, branded entry point into the property.</p>
      <p style="margin:0 0 20px;color:#374151;">No competing agents. No third-party clutter. Just your listing, your brand, your client.</p>
      <p style="margin:0 0 8px;color:#374151;"><strong>This is the kind of detail that:</strong></p>
      <ul style="margin:0 0 20px;padding-left:20px;color:#374151;line-height:1.9;">
        <li>Signals a higher level of service to sellers</li>
        <li>Positions you above other agents in listing presentations</li>
        <li>Creates a more curated, "luxury" buying experience</li>
        <li>Keeps all inquiries and attention centered on you</li>
      </ul>
      <p style="margin:0 0 16px;color:#374151;">We've already built everything — full-screen gallery, lead capture, and print-ready materials.</p>
      <p style="margin:0 0 ${count === 1 ? "8px" : "20px"};color:#374151;">To keep ${count === 1 ? "it" : "them"} live on ${count === 1 ? "its" : "their"} own domain, it's <strong>${count === 1 ? "$49/month" : "$49/month per listing"}</strong> (and it cancels automatically when the home sells).</p>
      ${count === 1 ? `<p style="margin:0 0 8px;color:#374151;">Activate it here:</p>
      <p style="margin:0 0 20px;"><a href="${escapeAttr(firstListing.activateUrl)}" style="color:#0d1b2a;font-weight:600;">Activate your site →</a></p>` : ""}
      <p style="margin:0 0 16px;color:#374151;">Even if you don't, feel free to use the ${count === 1 ? "preview" : "previews"} while ${count === 1 ? "it's" : "they're"} live.</p>
      <p style="margin:0 0 8px;color:#374151;">But if you do — this becomes more than a listing.</p>
      <p style="margin:0 0 20px;color:#374151;">It becomes part of your brand.</p>
      <p style="margin:20px 0 0;">— PropSite</p>
    `;

  const text =
    count === 1
      ? `Hi ${params.agentFirstName},\n\nI saw your listing at ${firstListing.address} just hit the market — so we quietly built something for you.\n\nA dedicated property website that presents the home the way high-end buyers expect: clean, focused, and distraction-free.\n\nTake a look: ${firstListing.previewUrl}\n\nNow imagine pairing it with this: ${firstDomain}\n\nA custom domain you can place on your sign rider, brochures, and ads — creating a direct, branded entry point into the property.\n\nNo competing agents. No third-party clutter. Just your listing, your brand, your client.\n\nThis is the kind of detail that:\n• Signals a higher level of service to sellers\n• Positions you above other agents in listing presentations\n• Creates a more curated, "luxury" buying experience\n• Keeps all inquiries and attention centered on you\n\nWe've already built everything — full-screen gallery, lead capture, and print-ready materials.\n\nTo keep it live on its own domain, it's $49/month (and it cancels automatically when the home sells).\n\nActivate it here: ${firstListing.activateUrl}\n\nEven if you don't, feel free to use the preview while it's live.\n\nBut if you do — this becomes more than a listing. It becomes part of your brand.\n\n— PropSite\n\nUnsubscribe: ${params.unsubscribeUrl}`
      : `Hi ${params.agentFirstName},\n\nI saw ${count} new listings from you just hit the market — so we quietly built something for each one.\n\n` +
        params.listings
          .map((l) => `• ${l.address}\n  Preview: ${l.previewUrl}\n  Domain: ${suggestDomain(l.address)}\n  Activate ($49/mo, cancels when sold): ${l.activateUrl}`)
          .join("\n\n") +
        `\n\nA custom domain on your sign rider, brochures, and ads — no competing agents, no clutter. Just your listing, your brand, your client.\n\nThis is the kind of detail that signals a higher level of service, positions you above other agents, creates a luxury experience, and keeps all inquiries centered on you.\n\nEven if you don't activate, feel free to use the previews while they're live.\n\nBut if you do — this becomes part of your brand.\n\n— PropSite\n\nUnsubscribe: ${params.unsubscribeUrl}`;

  return {
    to: params.agentEmail,
    subject,
    html: withFooter(html, params.unsubscribeUrl),
    text,
  };
}

/**
 * Notification email sent to the listing agent when someone views their
 * auto-built preview site. Lets them know the page is live and nudges
 * them to activate. Rate-limited by the caller; this function only
 * renders the email.
 */
export function previewViewedEmail(params: {
  agentEmail: string;
  agentFirstName: string;
  address: string;
  previewUrl: string;
  activateUrl: string;
  unsubscribeUrl: string;
}): EmailPayload {
  const domain = suggestDomain(params.address);
  const html = `
    <p style="margin:0 0 16px;">Hi ${escape(params.agentFirstName)},</p>
    <p style="margin:0 0 20px;">Someone just viewed your property preview site for <strong>${escape(params.address)}</strong>. Your page is live and working — here's the link:</p>
    <p style="margin:0 0 24px;">
      <a href="${escapeAttr(params.previewUrl)}" style="display:inline-block;padding:12px 24px;background:#c9a84c;color:#fff;font-weight:700;text-decoration:none;border-radius:9999px;">View your preview →</a>
    </p>
    <p style="margin:0 0 20px;">Ready to make it official? We can put it on <strong>${escape(domain)}</strong> today. It's <strong>$49/mo, or until sold</strong> — billing cancels automatically the day it closes.</p>
    <p style="margin:0 0 20px;"><a href="${escapeAttr(params.activateUrl)}" style="color:#0d1b2a;font-weight:600;">Activate &amp; claim your domain →</a></p>
    <p style="margin:0;">— PropSite</p>
  `;
  return {
    to: params.agentEmail,
    subject: `Someone viewed your listing preview — ${params.address}`,
    html: withFooter(html, params.unsubscribeUrl),
    text: `Hi ${params.agentFirstName}, someone just viewed your preview site for ${params.address}: ${params.previewUrl}. Activate it on ${domain} for $49/mo or until sold: ${params.activateUrl}. Unsubscribe: ${params.unsubscribeUrl}`,
  };
}

/**
 * Cold-outreach Follow-up — sent ~5 days after the initial digest if
 * the agent never signed up and never unsubscribed. One nudge only;
 * never repeats for the same agent.
 */
export function coldOutreachFollowupEmail(params: {
  agentEmail: string;
  agentFirstName: string;
  primaryAddress: string;
  primaryPreviewUrl: string;
  unsubscribeUrl: string;
}): EmailPayload {
  const html = `
      <p>Hi ${escape(params.agentFirstName)},</p>
      <p>Just circling back — your property site for <strong>${escape(params.primaryAddress)}</strong> is still ready when you are:</p>
      <p style="margin:24px 0;">
        <a href="${escapeAttr(params.primaryPreviewUrl)}" style="display:inline-block;padding:12px 24px;background:#c9a84c;color:#fff;font-weight:600;text-decoration:none;border-radius:9999px;">View it →</a>
      </p>
      <p>Activating takes about 60 seconds and runs $49/mo per active listing — billing stops automatically the day the listing closes.</p>
      <p>If this isn't for you, no worries — I won't email about this listing again.</p>
      <p>— PropSite</p>
    `;
  return {
    to: params.agentEmail,
    subject: `Still want a site for ${params.primaryAddress}?`,
    html: withFooter(html, params.unsubscribeUrl),
    text: `Hi ${params.agentFirstName}, your property site for ${params.primaryAddress} is still ready: ${params.primaryPreviewUrl}. Activate any time for $49/mo. Unsubscribe: ${params.unsubscribeUrl}`,
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

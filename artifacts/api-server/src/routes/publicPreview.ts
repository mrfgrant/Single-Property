import { Router } from "express";
import { db, listingsTable, agentsTable } from "@workspace/db";
import { exampleListingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail, previewViewedEmail } from "../lib/email.js";
import { buildUnsubscribeUrl } from "../lib/outreach/unsubscribe.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * Returns true for URLs that represent actual image files.
 * R2 paths (/objects/...) are always images.
 * External URLs must end with a recognised image extension.
 */
function isImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith("/objects/")) return true;
  const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|tiff?|bmp|svg)(\?.*)?$/i;
  return IMAGE_EXT.test(url);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/listings/preview/:id
 *
 * Public read of a real listing row by UUID — used by the marketing
 * site to render a preview-mode property page (the auto-generated site
 * an agent sees before they activate). Returns ONLY non-sensitive
 * fields plus the agent's display info; never returns sellerEmail,
 * stripe ids, or magic tokens.
 *
 * 404 for unknown ids, archived rows, or non-UUID inputs (so example
 * listing slugs that happen to hit this route fall through cleanly to
 * the example route on the client).
 */
router.get("/listings/preview/:id", async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const rows = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, id))
    .limit(1);
  const listing = rows[0];
  if (!listing || listing.purgedAt || listing.status === "archived" || listing.status === "closed") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (listing.mode === "disabled") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  let agentName: string | null = null;
  let agentPhone: string | null = null;
  let agentEmail: string | null = null;
  let agentPhotoUrl: string | null = null;
  let agentBrokerage: string | null = null;
  let brokerageLogoUrl: string | null = null;
  if (listing.agentId) {
    const agents = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, listing.agentId))
      .limit(1);
    const agent = agents[0];
    if (agent) {
      agentName = `${agent.firstName} ${agent.lastName}`.trim();
      agentPhone = agent.phone ?? null;
      agentEmail = agent.email;
      agentPhotoUrl = agent.headshotUrl ?? null;
      agentBrokerage = agent.brokerage ?? null;
      brokerageLogoUrl = agent.logoUrl ?? null;
    }
  }
  // Fallback to MLS-sourced agent fields when no agent is linked yet.
  // SANITIZATION: only the MLS-published "preferred phone" and email
  // (RESO ListAgentPreferredPhone / ListAgentEmail) are public IDX
  // fields. listAgentDirectPhone / listAgentMobilePhone are internal-
  // only — collected for our cold-outreach SMS targeting (see
  // lib/outreach/phone.ts) — and MUST NOT leak to the browser per IDX
  // private-field rules.
  if (!agentName) agentName = listing.listAgentName ?? null;
  if (!agentPhone) agentPhone = listing.listAgentPhone ?? null;
  if (!agentEmail) agentEmail = listing.listAgentEmail ?? null;

  res.json({
    listing: {
      id: listing.id,
      // Public IDX display: prefer the human MLS# (`mls_human_id`,
      // RESO ListingId). Fall back to mls_listing_id (which stores
      // ListingKey from sync, but on admin-imported rows holds the
      // human MLS# the operator typed) so legacy rows still render.
      mlsId: listing.mlsHumanId ?? listing.mlsListingId,
      // Marketing-site URL convention is /listing/:slug — for real
      // preview rows we use the UUID as the "slug" since the table has
      // no slug column. The client treats the id field as authoritative.
      slug: listing.id,
      address: listing.address,
      city: listing.city,
      state: listing.state,
      zip: listing.zip,
      priceUsd: listing.priceUsd,
      beds: listing.beds,
      baths: listing.baths,
      sqft: listing.sqft,
      lotAcres: listing.lotAcres,
      yearBuilt: listing.yearBuilt,
      description: listing.description,
      photoUrls: (listing.photoUrls ?? []).filter(isImageUrl),
      domainName: listing.domainName,
      mode: listing.mode,
      status: listing.status,
      featured: false,
      createdAt: listing.createdAt.toISOString(),
      agentName,
      agentPhone,
      agentEmail,
      agentPhotoUrl,
      // For MLS-sourced rows the IDX courtesy attribution must come
      // from the MLS feed's ListOfficeName, not the on-platform agent's
      // brokerage. Prefer the MLS value when present.
      agentBrokerage: listing.mlsBrokerageName ?? agentBrokerage,
      brokerageLogoUrl,
      mlsLastSyncedAt: listing.mlsLastSyncedAt
        ? listing.mlsLastSyncedAt.toISOString()
        : null,
    },
  });
});

/**
 * In-memory rate-limit: only send a preview-viewed notification once per
 * listing per hour, regardless of how many page loads occur.
 */
const previewViewedSentAt = new Map<string, number>();
const PREVIEW_VIEWED_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const log = logger.child({ component: "preview-viewed" });

const MARKETING_SITE_URL =
  process.env.MARKETING_SITE_URL ?? process.env.PLATFORM_HOMEPAGE_URL ?? "https://app.propsite.io";

/**
 * POST /api/listings/preview-viewed
 *
 * Called fire-and-forget by the marketing site when a visitor loads a
 * preview listing page. Sends a one-time notification email to the
 * listing agent so they know the auto-built site is live.
 *
 * Body: { id?: string, slug?: string }
 * - id  — UUID of an MLS-sourced row in the `listings` table
 * - slug — slug of a row in `example_listings`
 * (one of the two must be present)
 *
 * Always responds 204 — the caller ignores the result.
 */
router.post("/listings/preview-viewed", async (req, res) => {
  res.status(204).end(); // respond immediately; notification is best-effort

  try {
    const id = typeof req.body?.id === "string" ? req.body.id.trim() : null;
    const slug = typeof req.body?.slug === "string" ? req.body.slug.trim() : null;

    if (!id && !slug) return;

    const cacheKey = id ?? slug!;
    const lastSent = previewViewedSentAt.get(cacheKey);
    if (lastSent && Date.now() - lastSent < PREVIEW_VIEWED_COOLDOWN_MS) return;

    let agentEmail: string | null = null;
    let agentFirstName = "there";
    let address = "";
    let listingIdOrSlug = cacheKey;

    if (id && UUID_RE.test(id)) {
      // MLS-sourced listing
      const [row] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
      if (!row || row.purgedAt || row.mode !== "preview") return;
      address = row.address;
      listingIdOrSlug = row.id;
      agentEmail = row.listAgentEmail ?? null;
      if (row.listAgentName) {
        agentFirstName = row.listAgentName.split(/\s+/)[0]!;
      }
      if (row.agentId) {
        const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, row.agentId)).limit(1);
        if (agent) {
          agentEmail = agent.email;
          agentFirstName = agent.firstName;
        }
      }
    } else if (slug) {
      // Example listing
      const [row] = await db.select().from(exampleListingsTable).where(eq(exampleListingsTable.slug, slug)).limit(1);
      if (!row || row.status !== "active") return;
      address = row.address;
      agentEmail = row.agentEmail ?? null;
      if (row.agentName) {
        agentFirstName = row.agentName.split(/\s+/)[0]!;
      }
    }

    if (!agentEmail || !address) return;

    previewViewedSentAt.set(cacheKey, Date.now());

    const previewUrl = `${MARKETING_SITE_URL}/listing/${listingIdOrSlug}`;
    const activateUrl = `${MARKETING_SITE_URL}/onboarding?listing=${listingIdOrSlug}`;
    const unsubscribeUrl = buildUnsubscribeUrl(agentEmail);

    const payload = previewViewedEmail({
      agentEmail,
      agentFirstName,
      address,
      previewUrl,
      activateUrl,
      unsubscribeUrl,
    });

    await sendEmail(payload);
    log.info({ agentEmail, address }, "Preview-viewed notification sent");
  } catch (err) {
    log.error({ err }, "Failed to send preview-viewed notification");
  }
});

export default router;

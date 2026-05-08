import { Router } from "express";
import { db, listingsTable, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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
      photoUrls: listing.photoUrls,
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

export default router;

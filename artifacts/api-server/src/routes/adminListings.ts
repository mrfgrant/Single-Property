import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { exampleListingsTable, insertExampleListingSchema, listingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { adminAuth } from "../middleware/adminAuth.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { mlsClient, type ResoProperty } from "../lib/mls/client.js";
import { getMlsConfig } from "../lib/mls/config.js";
import { downloadAndStorePhoto } from "../lib/mls/photoUtils.js";
import { logger } from "../lib/logger.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG and WebP images are allowed"));
  },
});

const objectStorage = new ObjectStorageService();

/**
 * Resolve the opaque RESO ListingKey from a human MLS# (ListingId).
 *
 * Resolution order:
 *  1. `listings` table — row may already have the ListingKey in
 *     `mls_listing_id` if the background sync has ingested it.
 *  2. Live RESO query — authoritative fallback for listings that
 *     haven't been ingested yet.
 *
 * Returns null if MLS is unconfigured or the listing can't be found.
 */
async function resolveListingKey(mlsId: string): Promise<string | null> {
  const trimmed = mlsId.trim();
  if (!trimmed) return null;

  // Try the sync cache first (mlsHumanId stores the human ListingId).
  const [cached] = await db
    .select({ listingKey: listingsTable.mlsListingId })
    .from(listingsTable)
    .where(eq(listingsTable.mlsHumanId, trimmed))
    .limit(1);
  if (cached?.listingKey) return cached.listingKey;

  // Fall back to a live RESO query filtered by ListingId.
  const cfg = getMlsConfig();
  if (!cfg.configured) return null;
  try {
    const safe = trimmed.replace(/'/g, "''");
    for await (const page of mlsClient.iterateProperties({
      filter: `ListingId eq '${safe}'`,
      top: 1,
    })) {
      if (page.length > 0) return page[0].ListingKey;
    }
  } catch (err) {
    logger.warn({ err, mlsId: trimmed }, "resolveListingKey live query failed");
  }
  return null;
}

/**
 * Fire-and-forget: fetch MLS photos for an example listing and store
 * them in Object Storage, then write the `/objects/…` paths back to
 * `example_listings.photo_urls`.
 *
 * Skips silently if:
 *  - the listing already has photos (re-save idempotency)
 *  - MLS is unconfigured
 *  - the ListingKey can't be resolved
 *  - any photo download/upload fails (those photos are omitted)
 */
async function triggerMlsPhotoSync(exampleListingId: string, mlsId: string): Promise<void> {
  try {
    // Re-read the row so we always have the freshest photoUrls state.
    const [row] = await db
      .select({ photoUrls: exampleListingsTable.photoUrls })
      .from(exampleListingsTable)
      .where(eq(exampleListingsTable.id, exampleListingId))
      .limit(1);

    // Skip if photos already populated (manual upload or previous sync).
    if (row?.photoUrls && row.photoUrls.length > 0) return;

    const listingKey = await resolveListingKey(mlsId);
    if (!listingKey) {
      logger.warn({ exampleListingId, mlsId }, "MLS photo sync: could not resolve ListingKey");
      return;
    }

    const media = await mlsClient.fetchMediaForListing(listingKey);
    if (media.length === 0) return;

    const stored: string[] = [];
    for (const m of media.sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0))) {
      if (!m.MediaURL) continue;
      const path = await downloadAndStorePhoto(m.MediaURL);
      if (path) stored.push(path);
    }

    if (stored.length === 0) return;

    await db
      .update(exampleListingsTable)
      .set({ photoUrls: stored, updatedAt: new Date() })
      .where(eq(exampleListingsTable.id, exampleListingId));

    logger.info(
      { exampleListingId, mlsId, photoCount: stored.length },
      "MLS photo sync: stored photos for example listing",
    );
  } catch (err) {
    logger.warn({ err, exampleListingId, mlsId }, "MLS photo sync failed");
  }
}

/* POST /admin/listings/:id/sync-photos
 * Explicitly pull MLS photos for an example listing that has an MLS ID
 * but no photos yet. Returns the updated photo list so the form can
 * refresh immediately. Only runs when the listing currently has no photos
 * (protects manually-uploaded photos from being overwritten). */
router.post("/admin/listings/:id/sync-photos", adminAuth, async (req, res) => {
  const [listing] = await db
    .select()
    .from(exampleListingsTable)
    .where(eq(exampleListingsTable.id, req.params.id))
    .limit(1);

  if (!listing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!listing.mlsId) {
    res.status(400).json({ error: "Listing has no MLS ID — cannot sync photos" });
    return;
  }
  if (listing.photoUrls && listing.photoUrls.length > 0) {
    res.json({ photoCount: listing.photoUrls.length, photoUrls: listing.photoUrls, skipped: true });
    return;
  }

  const listingKey = await resolveListingKey(listing.mlsId);
  if (!listingKey) {
    res.status(422).json({ error: `Could not resolve MLS listing key for ID: ${listing.mlsId}` });
    return;
  }

  const media = await mlsClient.fetchMediaForListing(listingKey);
  if (media.length === 0) {
    res.json({ photoCount: 0, photoUrls: [], skipped: false });
    return;
  }

  const stored: string[] = [];
  for (const m of media.sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0))) {
    if (!m.MediaURL) continue;
    const path = await downloadAndStorePhoto(m.MediaURL);
    if (path) stored.push(path);
  }

  if (stored.length > 0) {
    await db
      .update(exampleListingsTable)
      .set({ photoUrls: stored, updatedAt: new Date() })
      .where(eq(exampleListingsTable.id, req.params.id));
  }

  logger.info(
    { listingId: req.params.id, mlsId: listing.mlsId, photoCount: stored.length },
    "Manual MLS photo sync complete",
  );

  res.json({ photoCount: stored.length, photoUrls: stored, skipped: false });
});

/* GET /admin/listings */
router.get("/admin/listings", adminAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(exampleListingsTable)
    .orderBy(desc(exampleListingsTable.featured), desc(exampleListingsTable.createdAt));
  res.json({ listings: rows });
});

/* POST /admin/listings */
router.post("/admin/listings", adminAuth, async (req, res) => {
  const parsed = insertExampleListingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }
  try {
    const [row] = await db.insert(exampleListingsTable).values(parsed.data).returning();
    res.status(201).json({ listing: row });
    // Fire-and-forget: download MLS photos and proxy them into Object Storage.
    // Response is already sent; this runs in the background without blocking the client.
    if (row.mlsId) {
      void triggerMlsPhotoSync(row.id, row.mlsId);
    }
  } catch (err: any) {
    // PostgreSQL unique_violation on slug — the listing already exists.
    // Return the existing row so the client can switch to edit mode rather
    // than surfacing a confusing 500 to the operator.
    if (err?.cause?.code === "23505" || err?.code === "23505" ||
        (err?.message ?? "").includes("unique") || (err?.cause?.message ?? "").includes("unique")) {
      const slug = parsed.data.slug;
      if (slug) {
        const [existing] = await db
          .select()
          .from(exampleListingsTable)
          .where(eq(exampleListingsTable.slug, slug))
          .limit(1);
        if (existing) {
          res.status(409).json({ error: `LISTING_EXISTS:${existing.id}`, listing: existing });
          return;
        }
      }
    }
    throw err;
  }
});

/* PATCH /admin/listings/:id */
router.patch("/admin/listings/:id", adminAuth, async (req, res) => {
  const parsed = insertExampleListingSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }
  const [row] = await db
    .update(exampleListingsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(exampleListingsTable.id, req.params.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ listing: row });
  // Fire-and-forget: sync photos if this listing has an MLS# and no photos yet.
  if (row.mlsId) {
    void triggerMlsPhotoSync(row.id, row.mlsId);
  }
});

/* DELETE /admin/listings/:id — hard delete */
router.delete("/admin/listings/:id", adminAuth, async (req, res) => {
  const [row] = await db
    .delete(exampleListingsTable)
    .where(eq(exampleListingsTable.id, req.params.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

/* POST /admin/listings/:id/photos — multipart upload */
router.post(
  "/admin/listings/:id/photos",
  adminAuth,
  upload.single("photo"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const [listing] = await db
      .select()
      .from(exampleListingsTable)
      .where(eq(exampleListingsTable.id, req.params.id));
    if (!listing) { res.status(404).json({ error: "Not found" }); return; }

    // Get a presigned PUT URL (generates a UUID-based object path internally)
    const presignedUrl = await objectStorage.getObjectEntityUploadURL();

    await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": req.file.mimetype },
      body: req.file.buffer,
    });

    // Normalize to a stable /objects/... path for serving via our API
    const objectPath = objectStorage.normalizeObjectEntityPath(presignedUrl);
    const currentPhotos = listing.photoUrls ?? [];
    const updatedPhotos = [...currentPhotos, objectPath];

    const [updated] = await db
      .update(exampleListingsTable)
      .set({ photoUrls: updatedPhotos, updatedAt: new Date() })
      .where(eq(exampleListingsTable.id, req.params.id))
      .returning();

    res.json({ listing: updated, photoUrl: objectPath });
  }
);

/* POST /admin/listings/:id/asset/:kind — upload agent photo or brokerage logo */
router.post(
  "/admin/listings/:id/asset/:kind",
  adminAuth,
  upload.single("file"),
  async (req, res) => {
    const kind = req.params.kind;
    if (kind !== "agent_photo" && kind !== "brokerage_logo") {
      res.status(400).json({ error: "Invalid asset kind" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const [listing] = await db
      .select()
      .from(exampleListingsTable)
      .where(eq(exampleListingsTable.id, req.params.id));
    if (!listing) { res.status(404).json({ error: "Not found" }); return; }

    const presignedUrl = await objectStorage.getObjectEntityUploadURL();
    await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": req.file.mimetype },
      body: req.file.buffer,
    });
    const objectPath = objectStorage.normalizeObjectEntityPath(presignedUrl);

    const updateField = kind === "agent_photo"
      ? { agentPhotoUrl: objectPath }
      : { brokerageLogoUrl: objectPath };

    const [updated] = await db
      .update(exampleListingsTable)
      .set({ ...updateField, updatedAt: new Date() })
      .where(eq(exampleListingsTable.id, req.params.id))
      .returning();

    res.json({ listing: updated, url: objectPath });
  }
);

/* DELETE /admin/listings/:id/asset/:kind */
router.delete("/admin/listings/:id/asset/:kind", adminAuth, async (req, res) => {
  const kind = req.params.kind;
  if (kind !== "agent_photo" && kind !== "brokerage_logo") {
    res.status(400).json({ error: "Invalid asset kind" });
    return;
  }
  const updateField = kind === "agent_photo"
    ? { agentPhotoUrl: null }
    : { brokerageLogoUrl: null };
  const [updated] = await db
    .update(exampleListingsTable)
    .set({ ...updateField, updatedAt: new Date() })
    .where(eq(exampleListingsTable.id, req.params.id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ listing: updated });
});

/* DELETE /admin/listings/:id/photos/:index */
router.delete("/admin/listings/:id/photos/:index", adminAuth, async (req, res) => {
  const idx = parseInt(req.params.index, 10);
  const [listing] = await db
    .select()
    .from(exampleListingsTable)
    .where(eq(exampleListingsTable.id, req.params.id));
  if (!listing) { res.status(404).json({ error: "Not found" }); return; }

  const photos = [...(listing.photoUrls ?? [])];
  if (idx < 0 || idx >= photos.length) {
    res.status(400).json({ error: "Invalid photo index" });
    return;
  }
  photos.splice(idx, 1);

  const [updated] = await db
    .update(exampleListingsTable)
    .set({ photoUrls: photos, updatedAt: new Date() })
    .where(eq(exampleListingsTable.id, req.params.id))
    .returning();

  res.json({ listing: updated });
});

/**
 * Cache-then-live single-property MLS resolver. Shared by the GET lookup
 * route and the POST import-from-mls alias so both endpoints have one
 * source of truth for the resolution logic.
 *
 * Resolution order:
 *   1. Local cache (`listings.mls_listing_id`) — best-effort fast path.
 *      Note: sync stores RESO `ListingKey` (opaque hex) here while
 *      operators usually paste the human `ListingId`/MLS#. The cache
 *      hits when they happen to match (some boards do, or when the
 *      operator pastes a ListingKey directly); otherwise we fall
 *      through to the live query, which is authoritative.
 *   2. Live RESO query filtered by `ListingId` against the configured
 *      MLS feed (SourceRE or generic RESO).
 */
type LookupResult =
  | { available: true; source: "cache" | "live"; data: Record<string, unknown> }
  | { available: false; reason: string };

async function resolveMlsListing(rawMlsId: string): Promise<LookupResult> {
  const mlsId = rawMlsId.trim();
  if (!mlsId) return { available: false, reason: "Missing MLS id" };

  const [cached] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.mlsListingId, mlsId))
    .limit(1);
  if (cached) {
    return {
      available: true,
      source: "cache",
      data: {
        mlsId: cached.mlsListingId ?? mlsId,
        address: cached.address,
        city: cached.city,
        state: cached.state,
        zip: cached.zip ?? "",
        priceUsd: cached.priceUsd ?? undefined,
        beds: cached.beds ?? undefined,
        baths: cached.baths ?? undefined,
        sqft: cached.sqft ?? undefined,
        lotAcres: cached.lotAcres ?? undefined,
        yearBuilt: cached.yearBuilt ?? undefined,
        description: cached.description ?? "",
        agentName: cached.listAgentName ?? "",
        agentEmail: cached.listAgentEmail ?? "",
        agentPhone: cached.listAgentPhone ?? "",
        agentBrokerage: cached.mlsBrokerageName ?? "",
        photoUrls: cached.photoUrls ?? [],
      },
    };
  }

  const cfg = getMlsConfig();
  if (!cfg.configured) {
    return { available: false, reason: "MLS integration not yet configured" };
  }

  const safe = mlsId.replace(/'/g, "''");
  let found: ResoProperty | null = null;
  for await (const page of mlsClient.iterateProperties({
    filter: `ListingId eq '${safe}'`,
    top: 1,
  })) {
    if (page.length > 0) {
      found = page[0];
      break;
    }
  }
  if (!found) {
    return { available: false, reason: `MLS #${mlsId} not found in feed` };
  }

  const p = found;
  const address =
    p.UnparsedAddress?.trim() ||
    [p.StreetNumber, p.StreetName, p.StreetSuffix]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "";
  // Photos are intentionally NOT returned in the live admin preview.
  // Raw RESO MediaURL values are third-party CDN URLs that must not
  // reach the browser per IDX rules. After the operator saves the
  // imported listing, the next sync tick downloads each photo into
  // Object Storage and rewrites listings.photoUrls to `/objects/<id>`
  // paths served through our /api/storage proxy.
  const photoUrls: string[] = [];
  return {
    available: true,
    source: "live",
    data: {
      mlsId,
      address,
      city: p.City ?? "",
      state: p.StateOrProvince ?? "GA",
      zip: p.PostalCode ?? "",
      priceUsd: p.ListPrice ?? undefined,
      beds: p.BedroomsTotal ?? undefined,
      baths: p.BathroomsTotalDecimal ?? p.BathroomsTotalInteger ?? undefined,
      // SourceRE uses BuildingAreaTotal; LivingArea is almost always null.
      // Round to integer — the DB column is integer and SourceRE can return floats.
      sqft: Math.round(p.BuildingAreaTotal ?? p.LivingArea ?? p.AboveGradeFinishedArea ?? 0) || undefined,
      lotAcres: p.LotSizeAcres ?? undefined,
      yearBuilt: p.YearBuilt ?? undefined,
      description: p.PublicRemarks ?? "",
      agentName: p.ListAgentFullName ?? "",
      agentEmail: p.ListAgentEmail ?? "",
      agentPhone: p.ListAgentPreferredPhone ?? "",
      agentBrokerage: p.ListOfficeName ?? "",
      photoUrls,
    },
  };
}

/* GET /admin/mls-lookup/:mlsId — pre-fill the admin "Add listing" form
 * from the MLS feed. Returns `{ available: false, reason }` when MLS
 * is unconfigured or the property can't be found so the admin form
 * degrades to manual entry without surfacing an error to the operator. */
router.get("/admin/mls-lookup/:mlsId", adminAuth, async (req, res) => {
  try {
    const result = await resolveMlsListing(String(req.params.mlsId || ""));
    res.json(result);
  } catch (err) {
    logger.warn({ err, mlsId: req.params.mlsId }, "MLS lookup failed");
    res.json({
      available: false,
      reason: err instanceof Error ? err.message : "MLS lookup failed unexpectedly",
    });
  }
});

/* POST /admin/listings/import-from-mls — symmetric alias for the GET
 * lookup, listed in the FG task spec. POSTing the MLS# in the body
 * avoids URL-encoding edge cases for non-canonical MLS# formats.
 * Returns the same `{ available, source, data }` shape; the admin form
 * previews the payload and the operator clicks Save to actually create
 * the row. */
router.post("/admin/listings/import-from-mls", adminAuth, async (req, res) => {
  const mlsNumber = String(req.body?.mlsNumber ?? req.body?.mlsId ?? "").trim();
  if (!mlsNumber) {
    res.status(400).json({ available: false, reason: "mlsNumber is required" });
    return;
  }
  try {
    const result = await resolveMlsListing(mlsNumber);
    res.json(result);
  } catch (err) {
    logger.warn({ err, mlsNumber }, "MLS import lookup failed");
    res.json({
      available: false,
      reason: err instanceof Error ? err.message : "MLS lookup failed unexpectedly",
    });
  }
});

export default router;

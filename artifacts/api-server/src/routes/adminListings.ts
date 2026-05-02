import { Router } from "express";
import multer from "multer";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { exampleListingsTable, insertExampleListingSchema } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { adminAuth } from "../middleware/adminAuth.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

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
  const [row] = await db.insert(exampleListingsTable).values(parsed.data).returning();
  res.status(201).json({ listing: row });
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
});

/* DELETE /admin/listings/:id */
router.delete("/admin/listings/:id", adminAuth, async (req, res) => {
  const [row] = await db
    .update(exampleListingsTable)
    .set({ status: "archived", updatedAt: new Date() })
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

    const ext = req.file.originalname.split(".").pop() ?? "jpg";
    const key = `listings/${req.params.id}/${Date.now()}.${ext}`;

    const uploadUrl = await objectStorage.getObjectEntityUploadURL({
      name: key,
      contentType: req.file.mimetype,
      size: req.file.size,
    });

    await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": req.file.mimetype },
      body: req.file.buffer,
    });

    const publicUrl = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""}/api/storage/objects/${key}`;
    const currentPhotos = listing.photoUrls ?? [];
    const updatedPhotos = [...currentPhotos, publicUrl];

    const [updated] = await db
      .update(exampleListingsTable)
      .set({ photoUrls: updatedPhotos, updatedAt: new Date() })
      .where(eq(exampleListingsTable.id, req.params.id))
      .returning();

    res.json({ listing: updated, photoUrl: publicUrl });
  }
);

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

/* GET /admin/mls-lookup/:mlsId — gracefully unavailable */
router.get("/admin/mls-lookup/:mlsId", adminAuth, (_req, res) => {
  res.json({ available: false, reason: "MLS integration not yet configured" });
});

export default router;

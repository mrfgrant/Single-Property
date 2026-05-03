import { Router } from "express";
import { db } from "@workspace/db";
import { exampleListingsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";
import { insertExampleListingSchema } from "@workspace/db/schema";

const router = Router();

/* GET /api/listings/examples — list all active example listings */
router.get("/listings/examples", async (_req, res) => {
  const rows = await db
    .select()
    .from(exampleListingsTable)
    .where(eq(exampleListingsTable.status, "active"))
    .orderBy(desc(exampleListingsTable.featured), desc(exampleListingsTable.createdAt));
  res.json({ listings: rows });
});

/* GET /api/listings/featured — single listing flagged "featured" for the
 * landing-page mock browser. Falls back to the most recent active listing
 * if no featured one exists. Returns 404 if no active listings at all. */
router.get("/listings/featured", async (_req, res) => {
  const [featured] = await db
    .select()
    .from(exampleListingsTable)
    .where(
      and(
        eq(exampleListingsTable.status, "active"),
        eq(exampleListingsTable.featured, true),
      ),
    )
    .orderBy(desc(exampleListingsTable.createdAt))
    .limit(1);
  if (featured) {
    res.json({ listing: featured });
    return;
  }
  const [fallback] = await db
    .select()
    .from(exampleListingsTable)
    .where(eq(exampleListingsTable.status, "active"))
    .orderBy(desc(exampleListingsTable.createdAt))
    .limit(1);
  if (!fallback) {
    res.status(404).json({ error: "No active listings" });
    return;
  }
  res.json({ listing: fallback });
});

/* GET /api/listings/examples/:slug — single example listing */
router.get("/listings/examples/:slug", async (req, res) => {
  const [row] = await db
    .select()
    .from(exampleListingsTable)
    .where(eq(exampleListingsTable.slug, req.params.slug));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ listing: row });
});

/* POST /api/listings/examples — create (admin only, checked upstream) */
router.post("/listings/examples", async (req, res) => {
  const parsed = insertExampleListingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }
  const [row] = await db
    .insert(exampleListingsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json({ listing: row });
});

/* PATCH /api/listings/examples/:id — update (admin only, checked upstream) */
router.patch("/listings/examples/:id", async (req, res) => {
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
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ listing: row });
});

/* DELETE /api/listings/examples/:id — soft delete via status (admin only) */
router.delete("/listings/examples/:id", async (req, res) => {
  const [row] = await db
    .update(exampleListingsTable)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(exampleListingsTable.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ success: true });
});

export default router;

import { Router } from "express";
import { db, automationRunsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { provisionDomainForListing } from "../lib/cloudflare/index.js";
import { handleListingClosed } from "../lib/cloudflare/lifecycle.js";
import { listRegisteredDomains } from "../lib/cloudflare/registrar.js";

const router = Router();

function requireAdminToken(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    next();
    return;
  }
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${adminToken}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use("/admin/domains", requireAdminToken);

router.get("/admin/domains/runs", async (_req, res) => {
  const runs = await db
    .select()
    .from(automationRunsTable)
    .orderBy(automationRunsTable.createdAt);
  res.json({ runs });
});

router.get("/admin/domains/runs/:id", async (req, res) => {
  const runs = await db
    .select()
    .from(automationRunsTable)
    .where(eq(automationRunsTable.id, req.params.id))
    .limit(1);
  if (!runs[0]) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json({ run: runs[0] });
});

router.post("/admin/domains/provision", async (req, res) => {
  const { listingId, address, city } = req.body as {
    listingId?: string;
    address?: string;
    city?: string;
  };

  if (!listingId || !address || !city) {
    res.status(400).json({ error: "listingId, address, and city are required" });
    return;
  }

  const result = await provisionDomainForListing(listingId, address, city);
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

router.post("/admin/domains/close", async (req, res) => {
  const { listingId, status, agentWebsiteUrl } = req.body as {
    listingId?: string;
    status?: "Sold" | "Withdrawn" | "Expired";
    agentWebsiteUrl?: string;
  };

  if (!listingId || !status) {
    res.status(400).json({ error: "listingId and status are required" });
    return;
  }

  const result = await handleListingClosed(listingId, status, agentWebsiteUrl);
  res.status(result.success ? 200 : 400).json(result);
});

router.get("/admin/domains/registered", async (_req, res) => {
  const domains = await listRegisteredDomains();
  res.json({ domains });
});

export default router;

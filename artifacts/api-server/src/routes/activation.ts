import { Router } from "express";
import { db, agentsTable, listingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  createListingSubscription,
  customerHasDefaultPaymentMethod,
} from "../lib/stripe/index.js";
import { provisionDomainForListing } from "../lib/cloudflare/index.js";
import { sendEmail, siteLiveEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";

const router = Router();

function requireMagicToken(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  const token = (req.query.token as string) || req.headers["x-agent-token"] as string;
  if (!token) {
    res.status(401).json({ error: "Agent token required" });
    return;
  }
  (req as typeof req & { agentToken: string }).agentToken = token;
  next();
}

router.post("/listings/:id/activate", requireMagicToken, async (req, res) => {
  const listingId = String(req.params.id);
  const token = (req as typeof req & { agentToken: string }).agentToken;

  const agents = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.magicLinkToken, token))
    .limit(1);

  const agent = agents[0];
  if (!agent) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const listings = await db
    .select()
    .from(listingsTable)
    .where(and(eq(listingsTable.id, listingId), eq(listingsTable.agentId, agent.id)))
    .limit(1);

  const listing = listings[0];
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  if (listing.mode === "live") {
    res.json({ already: true, domainName: listing.domainName });
    return;
  }

  if (!agent.stripeCustomerId) {
    res.status(402).json({ error: "Payment method not set up — complete onboarding first" });
    return;
  }

  // Hard gate: confirm the customer actually has a default payment method
  // attached (i.e. setup_intent.succeeded webhook fired). Otherwise the
  // first invoice would fail and we'd flip the listing live with no
  // collectable revenue.
  try {
    const ok = await customerHasDefaultPaymentMethod(agent.stripeCustomerId);
    if (!ok) {
      res.status(402).json({
        error:
          "No payment method on file. Open your billing portal from /profile to add a card, then try again.",
      });
      return;
    }
  } catch (err) {
    logger.error({ err, listingId, customerId: agent.stripeCustomerId }, "Failed to verify Stripe payment method");
    res.status(502).json({ error: "Could not verify payment method with Stripe" });
    return;
  }

  let stripeSubscriptionId = listing.stripeSubscriptionId;
  if (!stripeSubscriptionId) {
    try {
      const sub = await createListingSubscription({
        customerId: agent.stripeCustomerId,
        listingId: listing.id,
        agentEmail: agent.email,
      });
      stripeSubscriptionId = sub.id;
    } catch (err) {
      logger.error({ err, listingId }, "Failed to create Stripe subscription");
      res.status(402).json({ error: "Failed to create subscription — check your payment method" });
      return;
    }
  }

  const provisionResult = await provisionDomainForListing(
    listing.id,
    listing.address,
    listing.city,
  );

  if (provisionResult.status === "failed") {
    logger.error({ listingId, provisionResult }, "Domain provisioning failed");
    res.status(500).json({ error: "Domain provisioning failed", detail: provisionResult });
    return;
  }

  await db
    .update(listingsTable)
    .set({
      mode: "live",
      stripeSubscriptionId,
      domainName: provisionResult.domainName,
      updatedAt: new Date(),
    })
    .where(eq(listingsTable.id, listingId));

  if (provisionResult.domainName) {
    try {
      await sendEmail(
        siteLiveEmail({
          agentEmail: agent.email,
          agentFirstName: agent.firstName,
          address: listing.address,
          domainName: provisionResult.domainName,
        }),
      );
    } catch (err) {
      logger.error({ err }, "Failed to send site-live email");
    }
  }

  res.json({
    success: true,
    domainName: provisionResult.domainName,
    subscriptionId: stripeSubscriptionId,
    replitHandoffNote: provisionResult.replitHandoffNote,
  });
});

const newListingSchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().default("GA"),
  zip: z.string().optional(),
  priceUsd: z.number().int().positive().optional(),
  beds: z.number().int().optional(),
  baths: z.number().optional(),
  sqft: z.number().int().optional(),
  lotAcres: z.number().optional(),
  yearBuilt: z.number().int().optional(),
  description: z.string().optional(),
  mlsListingId: z.string().optional(),
});

router.post("/listings", requireMagicToken, async (req, res) => {
  const token = (req as typeof req & { agentToken: string }).agentToken;

  const agents = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.magicLinkToken, token))
    .limit(1);

  const agent = agents[0];
  if (!agent) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const parsed = newListingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  const [listing] = await db
    .insert(listingsTable)
    .values({ ...parsed.data, agentId: agent.id })
    .returning();

  res.status(201).json({ listing });
});

router.get("/listings", requireMagicToken, async (req, res) => {
  const token = (req as typeof req & { agentToken: string }).agentToken;

  const agents = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.magicLinkToken, token))
    .limit(1);

  const agent = agents[0];
  if (!agent) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const listings = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.agentId, agent.id))
    .orderBy(listingsTable.createdAt);

  res.json({ listings });
});

export default router;

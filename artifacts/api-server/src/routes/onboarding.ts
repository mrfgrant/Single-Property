import { Router } from "express";
import { db, agentsTable, listingsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "node:crypto";
import {
  createStripeCustomer,
  createOnboardingCheckoutSession,
} from "../lib/stripe/index.js";
import { sendEmail, welcomeEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";

const router = Router();

// Default to "AUG" (Augusta Metro Board of REALTORS — our launch market)
// so out-of-market detection works out-of-the-box without env config.
// Any deployment serving a different MLS just sets MLS_BOARD_ID.
const MLS_BOARD_ID = process.env.MLS_BOARD_ID ?? "AUG";
const MARKETING_SITE_URL =
  process.env.MARKETING_SITE_URL ??
  process.env.PLATFORM_HOMEPAGE_URL ??
  "https://app.propsite.io";

const onboardingSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  mlsAgentId: z.string().min(1),
  brokerage: z.string().optional(),
  personalWebsiteUrl: z.string().url().optional().or(z.literal("")),
  headshotUrl: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
});

router.post("/onboarding", async (req, res) => {
  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  const data = parsed.data;

  if (MLS_BOARD_ID && !data.mlsAgentId.toUpperCase().startsWith(MLS_BOARD_ID.toUpperCase())) {
    res.status(200).json({ outOfMarket: true });
    return;
  }

  const existing = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.email, data.email))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "An agent with this email already exists", agentId: existing[0].id });
    return;
  }

  const mlsExisting = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.mlsAgentId, data.mlsAgentId))
    .limit(1);

  if (mlsExisting.length > 0) {
    res.status(409).json({ error: "An agent with this MLS Agent ID already exists" });
    return;
  }

  let stripeCustomerId: string | undefined;
  try {
    const customer = await createStripeCustomer({
      email: data.email,
      name: `${data.firstName} ${data.lastName}`,
      phone: data.phone,
      metadata: { mlsAgentId: data.mlsAgentId },
    });
    stripeCustomerId = customer.id;
  } catch (err) {
    logger.error({ err }, "Failed to create Stripe customer — proceeding without");
  }

  const magicLinkToken = crypto.randomBytes(32).toString("hex");
  const magicLinkExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  const [agent] = await db
    .insert(agentsTable)
    .values({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      mlsAgentId: data.mlsAgentId,
      brokerage: data.brokerage,
      personalWebsiteUrl: data.personalWebsiteUrl || null,
      headshotUrl: data.headshotUrl || null,
      logoUrl: data.logoUrl || null,
      stripeCustomerId,
      magicLinkToken,
      magicLinkExpiresAt,
    })
    .returning();

  // Backfill: any preview listings whose listAgentMlsId matches this agent
  // and which aren't yet linked to an agent now belong to them. This is
  // how an agent who signs up *after* their listing was auto-built finds
  // their preview waiting for them.
  let backfilledCount = 0;
  try {
    const updated = await db
      .update(listingsTable)
      .set({ agentId: agent.id, updatedAt: new Date() })
      .where(
        and(
          eq(listingsTable.listAgentMlsId, data.mlsAgentId),
          isNull(listingsTable.agentId),
        ),
      )
      .returning({ id: listingsTable.id });
    backfilledCount = updated.length;
    if (backfilledCount > 0) {
      logger.info({ agentId: agent.id, count: backfilledCount }, "Backfilled preview listings to new agent");
    }
  } catch (err) {
    logger.error({ err, agentId: agent.id }, "Listing backfill failed (non-fatal)");
  }

  // Setup-mode Stripe Checkout to collect a card on file.
  let checkoutUrl: string | null = null;
  if (stripeCustomerId) {
    try {
      const successUrl = `${MARKETING_SITE_URL}/onboarding/success?token=${magicLinkToken}&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${MARKETING_SITE_URL}/onboarding?resume=${magicLinkToken}`;
      const session = await createOnboardingCheckoutSession({
        customerId: stripeCustomerId,
        successUrl,
        cancelUrl,
        agentId: agent.id,
      });
      checkoutUrl = session.url;
    } catch (err) {
      logger.error({ err, agentId: agent.id }, "Failed to create Stripe Checkout session — agent created without payment method");
    }
  }

  try {
    await sendEmail(welcomeEmail({ firstName: data.firstName, email: data.email }));
  } catch (err) {
    logger.error({ err }, "Failed to send welcome email");
  }

  res.status(201).json({
    outOfMarket: false,
    agentId: agent.id,
    profileUrl: `/api/agents/profile?token=${magicLinkToken}`,
    checkoutUrl,
    backfilledCount,
  });
});

export default router;

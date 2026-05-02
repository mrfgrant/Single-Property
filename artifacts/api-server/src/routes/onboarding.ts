import { Router } from "express";
import { db, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "node:crypto";
import { createStripeCustomer } from "../lib/stripe/index.js";
import { sendEmail, welcomeEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";

const router = Router();

const MLS_BOARD_ID = process.env.MLS_BOARD_ID ?? "";

const onboardingSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  mlsAgentId: z.string().min(1),
  brokerage: z.string().optional(),
  personalWebsiteUrl: z.string().url().optional().or(z.literal("")),
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
      stripeCustomerId,
      magicLinkToken,
      magicLinkExpiresAt,
    })
    .returning();

  try {
    await sendEmail(welcomeEmail({ firstName: data.firstName, email: data.email }));
  } catch (err) {
    logger.error({ err }, "Failed to send welcome email");
  }

  res.status(201).json({
    outOfMarket: false,
    agentId: agent.id,
    profileUrl: `/api/agents/profile?token=${magicLinkToken}`,
  });
});

export default router;

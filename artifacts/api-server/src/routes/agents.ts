import { Router } from "express";
import { db, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

function resolveToken(req: import("express").Request): string | null {
  return (req.query.token as string) || (req.headers["x-agent-token"] as string) || null;
}

async function findAgentByToken(token: string) {
  const agents = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.magicLinkToken, token))
    .limit(1);
  return agents[0] ?? null;
}

router.get("/agents/profile", async (req, res) => {
  const token = resolveToken(req);
  if (!token) {
    res.status(401).json({ error: "Agent token required" });
    return;
  }

  const agent = await findAgentByToken(token);
  if (!agent) {
    res.status(404).json({ error: "Agent not found or token expired" });
    return;
  }

  const { magicLinkToken: _, magicLinkExpiresAt: __, stripeCustomerId: ___, ...safeAgent } = agent;
  res.json({ agent: safeAgent });
});

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  brokerage: z.string().optional(),
  personalWebsiteUrl: z.string().url().optional().or(z.literal("")),
  headshotUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
});

router.patch("/agents/profile", async (req, res) => {
  const token = resolveToken(req);
  if (!token) {
    res.status(401).json({ error: "Agent token required" });
    return;
  }

  const agent = await findAgentByToken(token);
  if (!agent) {
    res.status(404).json({ error: "Agent not found or token expired" });
    return;
  }

  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  const updates = {
    ...parsed.data,
    personalWebsiteUrl: parsed.data.personalWebsiteUrl || null,
    updatedAt: new Date(),
  };

  const [updated] = await db
    .update(agentsTable)
    .set(updates)
    .where(eq(agentsTable.id, agent.id))
    .returning();

  const { magicLinkToken: _, magicLinkExpiresAt: __, stripeCustomerId: ___, ...safeAgent } = updated;
  res.json({ agent: safeAgent });
});

export default router;

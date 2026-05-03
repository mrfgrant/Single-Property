import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db, listingsTable, agentsTable, leadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { enqueueEmail } from "../lib/outbox/email.js";
import { leadAlertEmail, buyerAutoReplyEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const newLeadSchema = z.object({
  listingId: z.string().uuid(),
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional(),
  message: z.string().max(2000).optional(),
  source: z.string().max(40).optional(),
});

router.post("/leads", async (req, res) => {
  const parsed = newLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid lead", issues: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  const listings = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, data.listingId))
    .limit(1);
  const listing = listings[0];
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  // Resolve the recipient agent. May be null for preview/cold-outreach
  // listings — in that case we still capture the lead for posterity but
  // we don't have anyone to email yet.
  let agentEmail: string | null = null;
  let agentFirstName = "there";
  if (listing.agentId) {
    const agents = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, listing.agentId))
      .limit(1);
    const agent = agents[0];
    if (agent) {
      agentEmail = agent.email;
      agentFirstName = agent.firstName;
    }
  } else if (listing.listAgentEmail) {
    // Fallback to the MLS-listed agent email (cold-lead capture).
    agentEmail = listing.listAgentEmail;
    agentFirstName = (listing.listAgentName ?? "").trim().split(/\s+/)[0] || "there";
  }

  // Persist the lead and enqueue both notification emails atomically:
  // either we get the lead AND the outbox rows, or nothing — so a buyer
  // form never returns 201 while the agent silently never gets notified.
  let leadId: string;
  try {
    leadId = await db.transaction(async (tx) => {
      const [lead] = await tx
        .insert(leadsTable)
        .values({
          listingId: listing.id,
          name: data.name,
          email: data.email,
          phone: data.phone,
          message: data.message,
          source: data.source ?? "listing_site",
        })
        .returning();

      if (agentEmail) {
        await enqueueEmail(
          {
            toEmail: agentEmail,
            kind: "lead_alert",
            dedupeKey: `lead_alert:${lead.id}`,
            ...leadAlertEmail({
              agentEmail,
              agentFirstName,
              address: listing.address,
              buyerName: data.name,
              buyerEmail: data.email,
              buyerPhone: data.phone ?? null,
              message: data.message ?? null,
              listingPhotoUrl: listing.photoUrls?.[0] ?? null,
            }),
          },
          tx,
        );
      }
      await enqueueEmail(
        {
          toEmail: data.email,
          kind: "buyer_auto_reply",
          dedupeKey: `buyer_auto_reply:${lead.id}`,
          ...buyerAutoReplyEmail({
            buyerEmail: data.email,
            buyerName: data.name,
            address: listing.address,
          }),
        },
        tx,
      );
      return lead.id;
    });
  } catch (err) {
    logger.error({ err }, "Lead transaction failed");
    res.status(500).json({ error: "Failed to record lead" });
    return;
  }

  res.status(201).json({ leadId });
});

export default router;

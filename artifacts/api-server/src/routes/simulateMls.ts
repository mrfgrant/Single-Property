import { Router } from "express";
import { db } from "@workspace/db";
import { exampleListingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { adminAuth } from "../middleware/adminAuth.js";
import { sendEmail, previewReadyEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";

const router = Router();

const ONBOARDING_URL =
  process.env.ONBOARDING_URL ?? "https://app.propsite.io/onboarding";
const MARKETING_BASE_URL =
  process.env.MARKETING_BASE_URL ?? "https://propsite.io";

function slugify(input: string): string {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const simulateSchema = z.object({
  address: z.string().min(3),
  city: z.string().default("Augusta"),
  state: z.string().default("GA"),
  zip: z.string().optional(),
  priceUsd: z.number().int().positive().optional(),
  beds: z.number().int().optional(),
  baths: z.number().optional(),
  sqft: z.number().int().optional(),
  agentFirstName: z.string().min(1),
  agentLastName: z.string().optional().default(""),
  agentEmail: z.email(),
  agentPhone: z.string().optional(),
  agentBrokerage: z.string().optional(),
  sendEmail: z.boolean().default(true),
});

router.post("/admin/simulate-mls", adminAuth, async (req, res) => {
  const parsed = simulateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  const data = parsed.data;
  const baseSlug = slugify(data.address);

  // ensure slug uniqueness
  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const [existing] = await db
      .select({ id: exampleListingsTable.id })
      .from(exampleListingsTable)
      .where(eq(exampleListingsTable.slug, slug))
      .limit(1);
    if (!existing) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const agentName = `${data.agentFirstName} ${data.agentLastName}`.trim();

  const [listing] = await db
    .insert(exampleListingsTable)
    .values({
      slug,
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      priceUsd: data.priceUsd,
      beds: data.beds,
      baths: data.baths,
      sqft: data.sqft,
      agentName,
      agentEmail: data.agentEmail,
      agentPhone: data.agentPhone,
      agentBrokerage: data.agentBrokerage,
      status: "active",
      featured: false,
    })
    .returning();

  const previewUrl = `${MARKETING_BASE_URL}/listing/${slug}`;
  const activateUrl = `${ONBOARDING_URL}?address=${encodeURIComponent(
    data.address,
  )}&email=${encodeURIComponent(data.agentEmail)}`;

  let emailStatus: "sent" | "skipped" | "failed" = "skipped";
  let emailError: string | undefined;

  if (data.sendEmail) {
    try {
      await sendEmail(
        previewReadyEmail({
          agentEmail: data.agentEmail,
          agentFirstName: data.agentFirstName,
          address: data.address,
          previewUrl,
          activateUrl,
        }),
      );
      emailStatus = "sent";
    } catch (err) {
      logger.error({ err, listingId: listing.id }, "Failed to send preview email");
      emailStatus = "failed";
      emailError = err instanceof Error ? err.message : String(err);
    }
  }

  res.status(201).json({
    success: true,
    listing,
    previewUrl,
    activateUrl,
    emailStatus,
    emailError,
  });
});

export default router;

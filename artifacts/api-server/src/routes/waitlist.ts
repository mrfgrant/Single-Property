import { Router } from "express";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { waitlistEntriesTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const router = Router();

const waitlistSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.email(),
  city: z.string().optional(),
  state: z.string().optional(),
  mlsBoardName: z.string().optional(),
  source: z.enum(["marketing_site", "onboarding_redirect"]).default("marketing_site"),
});

router.post("/waitlist", async (req, res) => {
  const parsed = waitlistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  const data = parsed.data;

  await db
    .insert(waitlistEntriesTable)
    .values({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      city: data.city,
      state: data.state,
      mlsBoardName: data.mlsBoardName,
      source: data.source,
    })
    .onConflictDoUpdate({
      target: waitlistEntriesTable.email,
      set: {
        firstName: data.firstName,
        lastName: data.lastName,
        city: data.city,
        state: data.state,
        mlsBoardName: data.mlsBoardName,
        source: data.source,
      },
    });

  res.json({ success: true });
});

export default router;

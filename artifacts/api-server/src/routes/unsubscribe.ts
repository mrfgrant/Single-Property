import { Router, type IRouter, type Request, type Response } from "express";
import { db, emailSuppressionsTable, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyUnsubscribeToken } from "../lib/outreach/unsubscribe.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const log = logger.child({ component: "email-unsubscribe" });

async function suppress(email: string): Promise<void> {
  await db
    .insert(emailSuppressionsTable)
    .values({ email: email.toLowerCase(), source: "unsubscribe" })
    .onConflictDoNothing({ target: emailSuppressionsTable.email });
  // Mirror onto agent record if we know them.
  await db
    .update(agentsTable)
    .set({ unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(eq(agentsTable.email, email.toLowerCase()));
  log.info({ email }, "Email unsubscribe recorded");
}

/**
 * GET  /email/unsubscribe?email=… — one-click unsubscribe (CAN-SPAM).
 * POST /email/unsubscribe         — RFC 8058 List-Unsubscribe-Post target.
 *
 * Either method is acceptable to mail providers; both write to the same
 * suppression list.
 */
router.get("/email/unsubscribe", async (req: Request, res: Response) => {
  const email = String(req.query.email ?? "").trim();
  const token = String(req.query.token ?? "").trim();
  if (!email || !token) {
    res.status(400).type("html").send("<p>Missing email or token parameter.</p>");
    return;
  }
  if (!verifyUnsubscribeToken(email, token)) {
    // Reject without writing — prevents anyone from suppressing arbitrary
    // addresses by guessing the URL pattern.
    res.status(400).type("html").send("<p>Invalid or expired unsubscribe link.</p>");
    return;
  }
  await suppress(email);
  res
    .status(200)
    .type("html")
    .send(
      `<html><body style="font:16px/1.5 system-ui;padding:40px;max-width:520px;margin:auto;color:#0d1b2a;">
        <h1 style="font:600 22px serif;">You're unsubscribed</h1>
        <p>We won't email <strong>${escapeHtml(email)}</strong> again about new listings.</p>
        <p style="color:#5d6577;font-size:13px;">If this was a mistake, just reply to any prior email and we'll restore your address.</p>
      </body></html>`,
    );
});

router.post("/email/unsubscribe", async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? req.query.email ?? "").trim();
  const token = String(req.body?.token ?? req.query.token ?? "").trim();
  if (!email || !token) {
    res.status(400).json({ error: "Missing email or token" });
    return;
  }
  if (!verifyUnsubscribeToken(email, token)) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }
  await suppress(email);
  res.status(200).json({ ok: true });
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export default router;

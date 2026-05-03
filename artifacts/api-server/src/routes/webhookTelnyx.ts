import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import { db, smsSuppressionsTable } from "@workspace/db";
import { verifyWebhookSignature } from "../lib/telnyx/client.js";
import { normalize } from "../lib/outreach/phone.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const log = logger.child({ component: "telnyx-webhook" });

interface TelnyxMessageEvent {
  data?: {
    event_type?: string;
    payload?: {
      from?: { phone_number?: string };
      to?: Array<{ phone_number?: string }>;
      text?: string;
    };
  };
}

const STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);

/**
 * POST /webhooks/telnyx
 *
 * Telnyx posts message status + inbound message events. We only care
 * about inbound `message.received` for STOP keyword handling. Anything
 * else is ack'd 200 to satisfy the provider.
 *
 * Mounted with raw-body parsing because signature verification needs
 * the unmodified payload string.
 */
router.post(
  "/webhooks/telnyx",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString("utf8") : "";
    const signature = req.header("telnyx-signature-ed25519") ?? undefined;
    const timestamp = req.header("telnyx-timestamp") ?? undefined;

    if (!verifyWebhookSignature({ rawBody, signature, timestamp })) {
      log.warn("Rejected Telnyx webhook: bad signature");
      res.status(403).json({ error: "Invalid signature" });
      return;
    }

    let event: TelnyxMessageEvent;
    try {
      event = JSON.parse(rawBody) as TelnyxMessageEvent;
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    const eventType = event.data?.event_type;
    if (eventType !== "message.received") {
      // Ack delivery receipts and any other event types.
      res.status(200).json({ ok: true });
      return;
    }

    const fromRaw = event.data?.payload?.from?.phone_number;
    const text = (event.data?.payload?.text ?? "").trim().toLowerCase();
    const from = normalize(fromRaw);
    if (!from) {
      res.status(200).json({ ok: true });
      return;
    }

    const firstWord = text.split(/\s+/)[0] ?? "";
    if (STOP_KEYWORDS.has(firstWord)) {
      // Upsert suppression — onConflictDoNothing keeps original suppressedAt.
      await db
        .insert(smsSuppressionsTable)
        .values({ phone: from, source: "stop_reply" })
        .onConflictDoNothing({ target: smsSuppressionsTable.phone });
      log.info({ phone: from }, "STOP recorded — phone suppressed");
    }

    res.status(200).json({ ok: true });
  },
);

export default router;

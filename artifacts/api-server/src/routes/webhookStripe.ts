import express, { Router } from "express";
import { db, agentsTable, listingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { constructWebhookEvent, createCustomerPortalSession, setDefaultPaymentMethod } from "../lib/stripe/index.js";
import { sendEmail, paymentFailedEmail, siteDisabledEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";
import type Stripe from "stripe";

const router = Router();

const PLATFORM_HOMEPAGE = process.env.PLATFORM_HOMEPAGE_URL ?? "https://app.propsite.io";

async function getAgentAndListingBySubscription(subscriptionId: string) {
  const listings = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.stripeSubscriptionId, subscriptionId))
    .limit(1);
  const listing = listings[0];
  if (!listing) return null;

  const agents = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, listing.agentId))
    .limit(1);
  const agent = agents[0];
  if (!agent) return null;

  return { listing, agent };
}

async function getPortalUrl(customerId: string): Promise<string> {
  try {
    return await createCustomerPortalSession(customerId, PLATFORM_HOMEPAGE);
  } catch {
    return `${PLATFORM_HOMEPAGE}/billing`;
  }
}

function getSubscriptionId(invoice: Stripe.Invoice): string | null {
  const inv = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  if (!inv.subscription) return null;
  if (typeof inv.subscription === "string") return inv.subscription;
  return inv.subscription.id;
}

router.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;

    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
      res.status(200).json({ received: true });
      return;
    }

    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(req.body as Buffer, sig);
    } catch (err) {
      logger.error({ err }, "Webhook signature verification failed");
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    const eventType = event.type as string;
    logger.info({ type: eventType }, "Stripe webhook received");

    try {
      if (eventType === "invoice.payment_failed") {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getSubscriptionId(invoice);
        if (subscriptionId) {
          const pair = await getAgentAndListingBySubscription(subscriptionId);
          if (pair) {
            const { agent, listing } = pair;
            const portalUrl = await getPortalUrl(agent.stripeCustomerId!);
            await sendEmail(paymentFailedEmail({
              agentEmail: agent.email,
              agentFirstName: agent.firstName,
              address: listing.address,
              portalUrl,
            }));
            logger.info({ agentId: agent.id, listingId: listing.id }, "Payment-failed email sent");
          }
        }
      } else if (eventType === "customer.subscription.unpaid") {
        const subscription = event.data.object as Stripe.Subscription;
        const pair = await getAgentAndListingBySubscription(subscription.id);
        if (pair) {
          const { agent, listing } = pair;
          await db
            .update(listingsTable)
            .set({ mode: "disabled", updatedAt: new Date() })
            .where(eq(listingsTable.id, listing.id));
          const portalUrl = await getPortalUrl(agent.stripeCustomerId!);
          await sendEmail(siteDisabledEmail({
            agentEmail: agent.email,
            agentFirstName: agent.firstName,
            address: listing.address,
            portalUrl,
          }));
          logger.info({ agentId: agent.id, listingId: listing.id }, "Site disabled — unpaid subscription");
        }
      } else if (eventType === "invoice.payment_succeeded") {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getSubscriptionId(invoice);
        if (subscriptionId) {
          const pair = await getAgentAndListingBySubscription(subscriptionId);
          if (pair && pair.listing.mode === "disabled") {
            await db
              .update(listingsTable)
              .set({ mode: "live", updatedAt: new Date() })
              .where(eq(listingsTable.id, pair.listing.id));
            logger.info({ listingId: pair.listing.id }, "Site re-enabled after payment succeeded");
          }
        }
      } else if (eventType === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info({ sessionId: session.id, mode: session.mode, customer: session.customer }, "Checkout session completed");
        // For setup-mode onboarding sessions, the actual payment-method
        // attachment happens on setup_intent.succeeded below.
      } else if (eventType === "setup_intent.succeeded") {
        const setupIntent = event.data.object as Stripe.SetupIntent;
        const customerId = typeof setupIntent.customer === "string"
          ? setupIntent.customer
          : setupIntent.customer?.id;
        const paymentMethodId = typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id;
        if (customerId && paymentMethodId) {
          try {
            await setDefaultPaymentMethod(customerId, paymentMethodId);
            logger.info({ customerId, paymentMethodId }, "Default payment method set from onboarding setup intent");
          } catch (err) {
            logger.error({ err, customerId }, "Failed to set default payment method");
          }
        }
      } else if (eventType === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        const pair = await getAgentAndListingBySubscription(subscription.id);
        if (pair) {
          await db
            .update(listingsTable)
            .set({ mode: "disabled", status: "closed", updatedAt: new Date() })
            .where(eq(listingsTable.id, pair.listing.id));
          logger.info({ listingId: pair.listing.id }, "Listing closed — subscription deleted");
        }
      }
    } catch (err) {
      logger.error({ err, eventType }, "Error handling webhook event");
      res.status(500).json({ error: "Internal error processing event" });
      return;
    }

    res.json({ received: true });
  },
);

export default router;

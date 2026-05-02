import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  _stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
  return _stripe;
}

export async function createStripeCustomer(params: {
  email: string;
  name: string;
  phone?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  const stripe = getStripe();
  return stripe.customers.create({
    email: params.email,
    name: params.name,
    phone: params.phone,
    metadata: params.metadata ?? {},
  });
}

export async function createListingSubscription(params: {
  customerId: string;
  listingId: string;
  agentEmail: string;
}): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_LISTING_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_LISTING_PRICE_ID is not set — create a $49/mo price in Stripe dashboard and set this env var");

  return stripe.subscriptions.create({
    customer: params.customerId,
    items: [{ price: priceId }],
    metadata: {
      listingId: params.listingId,
      agentEmail: params.agentEmail,
    },
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
  });
}

export async function cancelListingSubscription(
  subscriptionId: string,
): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.cancel(subscriptionId);
}

export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

export function constructWebhookEvent(
  payload: Buffer,
  signature: string,
): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

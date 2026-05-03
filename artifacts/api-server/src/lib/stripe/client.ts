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

/**
 * Setup-mode Checkout Session: collects + saves a card on the customer
 * without charging. Used at the end of onboarding so we have a payment
 * method on file before any listing is activated.
 */
export async function createOnboardingCheckoutSession(params: {
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  agentId: string;
}): Promise<{ url: string; id: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: params.customerId,
    payment_method_types: ["card"],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { agentId: params.agentId, flow: "onboarding" },
    setup_intent_data: {
      metadata: { agentId: params.agentId, flow: "onboarding" },
    },
  });
  if (!session.url) throw new Error("Stripe Checkout session has no url");
  return { url: session.url, id: session.id };
}

/**
 * After a setup_intent succeeds, attach the resulting payment method as
 * the customer's default for future invoices/subscriptions.
 */
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string,
): Promise<void> {
  const stripe = getStripe();
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
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

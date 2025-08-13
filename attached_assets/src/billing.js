import Stripe from "stripe";
import { CREDIT_PACKS, SUCCESS_URL, CANCEL_URL } from "./config.js";
import { getDb, addCredits, recordBillingEvent } from "./db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-06-20" });

export async function createCheckoutSession({ email, pack }) {
  const cfg = CREDIT_PACKS[pack];
  if (!cfg || !cfg.price) throw new Error("Unknown or unconfigured pack");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: cfg.price, quantity: 1 }],
    success_url: SUCCESS_URL + "&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: CANCEL_URL,
    customer_email: email || undefined,
    metadata: { pack, credits: String(cfg.credits) }
  });
  return session.url;
}

export async function handleWebhook(rawBody, signature) {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    throw err;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    let email = session.customer_details?.email || session.customer_email || null;
    let credits = Number(session.metadata?.credits || 0);
    let priceId = null;

    try {
      const retrieved = await stripe.checkout.sessions.retrieve(session.id, { expand: ["line_items.data.price"] });
      priceId = retrieved?.line_items?.data?.[0]?.price?.id || null;
    } catch {}

    if (email && credits > 0) {
      addCredits(email, credits);
      recordBillingEvent({ email, credits_added: credits, stripe_checkout_id: session.id, stripe_price_id: priceId });
      console.log(`Added ${credits} credits to ${email}`);
    } else {
      console.warn("Missing email or credits on checkout.session.completed");
    }
  }

  return { received: true };
}

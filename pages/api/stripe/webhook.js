import Stripe from "stripe";

// Next.js API route: disable body parsing so we can verify Stripe signature
export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  // Allow non-POST for quick diagnostics
  if (req.method !== "POST") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true, method: req.method }));
  }

  // Kill-switch: acknowledge but ignore to stop retries
  if (process.env.PAYMENTS_ENABLED !== "1") {
    console.log("⚠️ Webhook received while payments are disabled");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ignored: true, reason: "payments_disabled" }));
  }

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    res.statusCode = 500;
    return res.end("Webhook not configured: missing STRIPE_WEBHOOK_SECRET");
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    res.statusCode = 500;
    return res.end("Webhook not configured: missing STRIPE_SECRET_KEY");
  }
  const stripe = new Stripe(key);

  let event;
  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    res.statusCode = 400;
    return res.end(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        // TODO: later — idempotent fulfillment by event.id
        console.log(`✅ (ready) checkout.session.completed id=${s.id} pack=${s.metadata?.pack}`);
        break;
      }
      default:
        console.log(`ℹ️ Unhandled event type ${event.type}`);
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ received: true }));
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Webhook handler error" }));
  }
}

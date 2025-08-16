const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  // Keep GET/others for quick diagnostics
  if (req.method !== "POST") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true, method: req.method }));
  }

  // Kill-switch: acknowledge but ignore so Stripe doesn’t retry
  if (process.env.PAYMENTS_ENABLED !== "1") {
    console.log("⚠️ Webhook received while payments are disabled");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({ ignored: true, reason: "payments_disabled" }),
    );
  }

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
        // TODO: later—fulfill idempotently by event.id, grant credits/entitlements, send receipt
        console.log(
          `✅ (ready) checkout.session.completed id=${s.id} pack=${s.metadata?.pack}`,
        );
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
};

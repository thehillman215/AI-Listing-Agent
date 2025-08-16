import Stripe from "stripe";

const PRICE_MAP = {
  "10": process.env.STRIPE_PRICE_10,
  "20": process.env.STRIPE_PRICE_20,
  "50": process.env.STRIPE_PRICE_50,
  "100": process.env.STRIPE_PRICE_100,
};

function getOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  // Kill-switch
  if (process.env.PAYMENTS_ENABLED !== "1") {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Payments are disabled" }));
  }

  // POST only
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Use POST" }));
  }

  // Optional shared-secret
  const required = process.env.PAYMENTS_SECRET;
  if (required && req.headers["x-payments-secret"] !== required) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Stripe not configured: missing STRIPE_SECRET_KEY" }));
  }
  const stripe = new Stripe(key);

  try {
    // Use JSON body if present; fallback to query; default "20"
    const pack = String((req.body && req.body.pack) || (req.query && req.query.pack) || "20");
    const price = PRICE_MAP[pack];
    if (!price) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: `Unknown pack "${pack}"` }));
    }

    const origin = getOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/api/health?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/canceled.html`,
      metadata: { pack },
    });

    res.writeHead(303, { Location: session.url });
    res.end();
  } catch (err) {
    console.error("create-checkout-session error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Internal error creating session" }));
  }
}

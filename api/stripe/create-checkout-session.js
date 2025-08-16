import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

function getBaseUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  const host = (
    req.headers["x-forwarded-host"] ||
    req.headers.host ||
    ""
  ).toString();
  if (host) return `${proto}://${host}`;
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL; // optional env fallback
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`; // vercel fallback
  throw new Error("Cannot determine base URL");
}

const MAP = {
  20: process.env.NEXT_PUBLIC_STRIPE_PRICE_20,
  50: process.env.NEXT_PUBLIC_STRIPE_PRICE_50,
  200: process.env.NEXT_PUBLIC_STRIPE_PRICE_200,
};

export default async function handler(req, res) {
  try {
    const pack = (req.query.pack || "20").toString();
    const price = MAP[pack];
    if (!price) return res.status(400).json({ error: "Unknown pack" });

    const baseUrl = getBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      success_url: `${baseUrl}/?success=1`,
      cancel_url: `${baseUrl}/?canceled=1`,
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

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
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      success_url: `${req.headers.origin}/?success=1`,
      cancel_url: `${req.headers.origin}/?canceled=1`,
    });
    res.status(200).json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

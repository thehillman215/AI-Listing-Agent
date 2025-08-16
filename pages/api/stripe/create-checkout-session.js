export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // Kill-switch (keep Vercel env set to PAYMENTS_ENABLED=0)
  if (process.env.PAYMENTS_ENABLED !== '1') {
    console.log('[stripe][checkout] payments_disabled');
    return res.status(503).json({ ok: false, error: 'payments_disabled' });
  }

  // Optional shared secret header
  const expected = (process.env.PAYMENTS_SECRET || '').trim();
  if (expected && req.headers['x-payments-secret'] !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const { pack } = req.body || {};
    const priceMap = {
      '20': process.env.STRIPE_PRICE_20,
      '50': process.env.STRIPE_PRICE_50,
      '200': process.env.STRIPE_PRICE_200
    };
    const price = priceMap[String(pack)];
    if (!price) return res.status(400).json({ ok: false, error: 'invalid_pack' });

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: process.env.STRIPE_SUCCESS_URL || 'https://example.com/success',
      cancel_url: process.env.STRIPE_CANCEL_URL || 'https://example.com/cancel',
      metadata: { pack: String(pack) }
    });

    return res.status(200).json({ ok: true, id: session.id, url: session.url });
  } catch (err) {
    console.error('[stripe][checkout] error', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
}

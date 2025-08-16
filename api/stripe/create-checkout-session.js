const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_MAP = {
  "10": process.env.STRIPE_PRICE_10,
  "20": process.env.STRIPE_PRICE_20,
  "50": process.env.STRIPE_PRICE_50,
  "100": process.env.STRIPE_PRICE_100,
};

function getOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

module.exports = async (req, res) => {
  try {
    const pack = String(req.query.pack || '20');
    const price = PRICE_MAP[pack];
    if (!price) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: `Unknown pack "${pack}"` }));
    }

    const origin = getOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/api/health?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/canceled.html`,
      metadata: { pack },
    });

    res.writeHead(303, { Location: session.url });
    res.end();
  } catch (err) {
    console.error('create-checkout-session error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal error creating session' }));
  }
};

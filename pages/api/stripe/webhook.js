export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const raw = await readRawBody(req);

  // Kill-switch: short-circuit while disabled
  if (process.env.PAYMENTS_ENABLED !== '1') {
    console.log('[stripe][webhook] payments_disabled', { len: raw.length });
    return res.status(200).end('ok');
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, secret);
    } catch (err) {
      console.error('[stripe][webhook] signature_verification_failed', err?.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('[stripe][webhook] received', event.type);
    return res.status(200).end('ok');
  } catch (err) {
    console.error('[stripe][webhook] handler_error', err);
    return res.status(500).end('error');
  }
}

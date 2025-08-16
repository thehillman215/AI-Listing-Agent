// Stripe webhook endpoint - disabled via env flag
export const config = {
  api: {
    bodyParser: false, // Required for Stripe webhook raw body
  },
};

export default function handler(req, res) {
  // Check if payments are enabled
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === '1';
  
  if (!paymentsEnabled) {
    console.log('Stripe webhook received but payments_disabled');
    return res.status(200).json({ 
      received: true, 
      processed: false,
      reason: 'payments_disabled' 
    });
  }

  // If payments were enabled, this would contain the webhook processing logic
  console.log('Stripe webhook received but payments_disabled');
  res.status(200).json({ 
    received: true, 
    processed: false,
    reason: 'payments_disabled' 
  });
}
// Stripe checkout session endpoint - disabled via env flag
export default function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if payments are enabled
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === '1';
  
  if (!paymentsEnabled) {
    return res.status(503).json({ 
      error: 'Payments are currently disabled',
      payments_enabled: false 
    });
  }

  // If payments were enabled, this would contain the Stripe checkout logic
  res.status(503).json({ 
    error: 'Payments are currently disabled',
    payments_enabled: false 
  });
}
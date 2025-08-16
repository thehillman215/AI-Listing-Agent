export default function handler(req, res) {
  const required = [
    "STRIPE_SECRET_KEY",
    "NEXT_PUBLIC_STRIPE_PRICE_20",
    "NEXT_PUBLIC_STRIPE_PRICE_50",
    "NEXT_PUBLIC_STRIPE_PRICE_200",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "EMAIL_REPLY_TO",
  ];
  const checks = Object.fromEntries(required.map((k) => [k, !!process.env[k]]));
  res.status(200).json({ ok: true, checks });
}

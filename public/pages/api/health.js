import type { NextApiRequest, NextApiResponse } from "next";
const required = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PRICE_20",
  "NEXT_PUBLIC_STRIPE_PRICE_50",
  "NEXT_PUBLIC_STRIPE_PRICE_200",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
];
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const checks: Record<string, boolean> = {};
  for (const k of required) checks[k] = !!process.env[k];
  res.status(200).json({ ok: true, checks });
}

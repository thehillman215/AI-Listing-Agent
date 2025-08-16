// Health check endpoint for Vercel deployment
export default function handler(req, res) {
  res.status(200).json({ ok: true });
}
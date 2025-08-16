export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || null;
  return res.status(200).json({
    ok: true,
    service: 'health',
    ts: new Date().toISOString(),
    commit: sha,
    env: process.env.NODE_ENV || 'development'
  });
}

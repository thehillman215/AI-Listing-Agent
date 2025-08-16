export const config = { runtime: "nodejs20.x" };

export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({ ok: true, path: req.url, now: new Date().toISOString() }),
  );
}

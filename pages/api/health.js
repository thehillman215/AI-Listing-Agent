export default function handler(req, res) {
  const { paid, ...q } = req.query || {};
  res.status(200).json({
    ok: true,
    service: "health",
    paid: paid === "1",
    time: new Date().toISOString(),
    query: q
  });
}

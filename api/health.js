export default function handler(req, res) {
  const { paid, ...q } = req.query || {};
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      service: "health",
      paid: paid === "1",
      time: new Date().toISOString(),
      query: q,
    }),
  );
}

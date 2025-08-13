import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieSession from "cookie-session";
import rateLimit from "express-rate-limit";
import { ensureDb, getDb, getOrCreateUserByEmail, getCredits, decrementCredit, createUser, findUserByEmail, recordBillingEvent, getBrandPreset, saveBrandPreset } from "./src/db.js";
import { generateListing } from "./src/generation.js";
import { createCheckoutSession, handleWebhook } from "./src/billing.js";
import { renderPdfBuffer } from "./src/export.js";
import { sendResultsEmail } from "./src/email.js";

dotenv.config();
const app = express();

// Stripe webhook must use raw body
app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];
    const event = await handleWebhook(req.body, sig);
    // record event into db if credits added (billing.js handles users table updates)
    res.json(event);
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// Sessions
app.use(cookieSession({
  name: "session",
  keys: [process.env.SESSION_SECRET || "dev_insecure"],
  httpOnly: true,
  sameSite: "lax",
  maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
}));

// JSON parser for the rest
app.use(express.json({ limit: "1mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

ensureDb();

// --- Auth ---
app.post("/auth/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const user = await createUser(email, password, Number(process.env.FREE_CREDITS_EMAIL || 5));
    req.session.user = { email: user.email };
    res.json({ ok: true, email: user.email });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const ok = await findUserByEmail(email, password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    req.session.user = { email };
    res.json({ ok: true, email });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.post("/auth/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get("/me", (req, res) => {
  const email = req.session?.user?.email || null;
  const credits = email ? (getCredits(email) ?? 0) : null;
  res.json({ email, credits });
});

// --- Billing: create Checkout Session (requires login) ---
app.post("/billing/checkout", async (req, res) => {
  try {
    const email = req.session?.user?.email || null;
    if (!email) return res.status(401).json({ error: "Login required" });
    const { pack } = req.body || {};
    const url = await createCheckoutSession({ email, pack });
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: String(err) });
  }
});

// --- Rate limit on /generate ---
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PER_MIN || 10)
});

// --- Generate route ---
app.post("/generate", limiter, async (req, res) => {
  try {
    const body = req.body || {};
    const email = req.session?.user?.email || null;
    const guestCredits = Number(process.env.FREE_CREDITS_GUEST || 3);

    if (email) {
      // Ensure user exists with default email credits
      getOrCreateUserByEmail(email, Number(process.env.FREE_CREDITS_EMAIL || 5));
      const available = getCredits(email) || 0;
      if (available <= 0) {
        return res.status(402).json({ error: "Not enough credits", need_credits: true });
      }
    }

    const { result, flags, tokens, model } = await generateListing({ ...body, user: { email } });

    if (email) {
      const ok = decrementCredit(email);
      if (!ok) return res.status(402).json({ error: "Not enough credits", need_credits: true });
    }

    res.json({ ...result, flags, tokens, model });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Generation failed", detail: String(err) });
  }
});

// --- Utility endpoints ---
app.get("/credits", (req, res) => {
  const email = req.session?.user?.email || null;
  const c = email ? getCredits(email) : null;
  res.json({ credits: c });
});

app.get("/history", async (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.json({ items: [] });
  const { getDb } = await import("./src/db.js");
  const db = getDb();
  const rows = db.prepare("SELECT id, created_at, output_payload FROM generation_jobs WHERE user_email=? ORDER BY created_at DESC LIMIT 20").all(email);
  const items = rows.map(r => ({ id: r.id, created_at: r.created_at, output: JSON.parse(r.output_payload || "{}") }));
  res.json({ items });
});

app.get("/usage", async (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  const db = getDb();
  const totals = db.prepare("SELECT COUNT(*) as jobs, SUM(tokens_prompt) as tp, SUM(tokens_completion) as tc FROM generation_jobs WHERE user_email=?").get(email);
  const events = db.prepare("SELECT id, credits_added, stripe_price_id, created_at FROM billing_events WHERE user_email=? ORDER BY created_at DESC LIMIT 10").all(email);
  res.json({ totals, events });
});


// --- Brand presets ---
app.get("/brand", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  const preset = getBrandPreset(email) || null;
  res.json({ preset });
});

app.post("/brand", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  const { voice, reading_level, keywords } = req.body || {};
  saveBrandPreset(email, { voice, reading_level, keywords });
  res.json({ ok: true });
});

// --- PDF export ---
app.post("/export/pdf", async (req, res) => {
  try {
    const email = req.session?.user?.email || null;
    if (!email) return res.status(401).json({ error: "Login required" });
    const { property, outputs } = req.body || {};
    const buf = await renderPdfBuffer({ property, outputs });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=listing_package.pdf");
    res.send(buf);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// --- Email results ---
app.post("/email", async (req, res) => {
  try {
    const email = req.session?.user?.email || null;
    if (!email) return res.status(401).json({ error: "Login required" });
    const { to = email, property, outputs } = req.body || {};
    const subject = `Your listing draft: ${property?.address || "Property"}`;
    const html = `
      <div style="font-family:system-ui,Segoe UI,Arial">
        <h2>Listing Package</h2>
        <p><strong>Address:</strong> ${escapeHtml(property?.address || "")}</p>
        <h3>MLS Description</h3>
        <pre>${escapeHtml(outputs?.description_mls || "")}</pre>
        <h3>Highlights</h3>
        <ul>${(outputs?.bullets || []).map(b => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
        <h3>Social Caption</h3>
        <pre>${escapeHtml(outputs?.social_caption || "")}</pre>
      </div>`;
    const pdf = await renderPdfBuffer({ property, outputs });
    const r = await sendResultsEmail({
      to,
      subject,
      html,
      attachments: [{ filename: "listing_package.pdf", content: pdf }]
    });
    res.json({ ok: true, id: r?.id || null });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#039;" }[c]));
}

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI Listing Agent v1.1 on http://localhost:${PORT}`));

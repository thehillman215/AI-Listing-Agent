import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieSession from "cookie-session";
import rateLimit from "express-rate-limit";

import {
  ensureDb,
  getDb,
  getOrCreateUserByEmail,
  getCredits,
  decrementCredit,
  createUser,
  findUserByEmail,
  getBrandPresets,
  saveBrandPreset,
  deleteBrandPreset,
  getPropertyTemplates,
  savePropertyTemplate,
  getUserSubscription,
  updateUserSubscription,
  saveGenerationFeedback,
  trackUserEvent,
  createBatchJob,
  getBatchJob,
  getUserBatchJobs,
} from "./src/db.js";

import { generateListing } from "./src/generation.js";
import {
  createCheckoutSession,
  handleWebhook,
  reconcileSession,
} from "./src/billing.js";
import {
  processBatchProperties,
  validateBatchProperties,
} from "./src/batchProcessor.js";
import { renderPdfBuffer } from "./src/export.js";
import { sendResultsEmail } from "./src/email.js";

dotenv.config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const app = express();

// ---------- FAST HEALTH & ROOT (placed first) ----------
    db.prepare("SELECT 1").get();
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV || "development",
      port: String(PORT),
      host: HOST,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    });
  } catch (error) {
    res.status(503).json({ status: "unhealthy", error: String(error?.message || error) });
  }
});

app.get("/healthz", (req, res) => res.status(200).json({ status: "ok" }));
app.get("/ready", (req, res) => res.status(200).json({ status: "ready" }));
app.get("/ping", (req, res) => res.status(200).type("text/plain").send("pong"));

// Keep root blazing fast for platform health checks.
// Serve UI at /app (see static section below).
});

// ---------- STRIPE WEBHOOK (raw body) ----------
app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const sig = req.headers["stripe-signature"];
      const event = await handleWebhook(req.body, sig);
      res.json(event);
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

// ---------- SECURITY / SESSIONS / JSON ----------
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "dev_insecure"],
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  })
);
app.use(express.json({ limit: "1mb" }));

// ---------- RATE LIMITERS ----------
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PER_MIN || 10),
});

// ---------- STATIC FRONTEND ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// Serve the app UI at /app (root remains fast JSON)
app.get("/app", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- AUTH ----------
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
  const subscription = email ? getUserSubscription(email) : null;
  res.json({ email, credits, subscription });
});

// ---------- BILLING ----------
app.post("/billing/checkout", async (req, res) => {
  try {
    const email = req.session?.user?.email || null;
    if (!email) return res.status(401).json({ error: "Login required" });
    const { pack } = req.body || {};
    const url = await createCheckoutSession({ email, pack });
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.get("/billing/verify", async (req, res) => {
  try {
    const session_id = req.query.session_id;
    const email = req.session?.user?.email || null;
    if (!session_id || !email) return res.status(400).json({ ok: false, error: "Missing session or login" });
    const out = await reconcileSession({ session_id, email });
    res.json({ ok: true, reconciled: out.reconciled, credits_added: out.credits || 0 });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

// ---------- GENERATE ----------
app.post("/generate", generateLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const email = req.session?.user?.email || null;
    const variations = parseInt(body.variations) || 1;

    if (email) {
      // ensure user exists + has email-tier free credits
      getOrCreateUserByEmail(email, Number(process.env.FREE_CREDITS_EMAIL || 5));
      const available = getCredits(email) || 0;
      if (available < variations) {
        return res.status(402).json({
          error: "Not enough credits",
          need_credits: true,
          required: variations,
          available,
        });
      }
    }

    const result = await generateListing({ ...body, user: { email } });

    if (email) {
      for (let i = 0; i < variations; i++) {
        const ok = decrementCredit(email);
        if (!ok) return res.status(402).json({ error: "Not enough credits", need_credits: true });
      }
      try {
        trackUserEvent(email, "listing_generated", {
          variations,
          propertyType: body.property?.type,
          template: body.template_id,
        });
      } catch {}
    }

    if (result.variations) {
      res.json({
        ...result.variations[0],
        jobId: result.jobId,
        variations: result.variations,
        flags: result.flags,
        tokens: result.tokens,
        model: result.model,
      });
    } else {
      res.json({
        ...result,
        variations: [result],
        flags: result.flags,
        tokens: result.tokens,
        model: result.model,
      });
    }
  } catch (err) {
    res.status(500).json({ error: "Generation failed", detail: String(err) });
  }
});

app.get("/credits", (req, res) => {
  const email = req.session?.user?.email || null;
  const c = email ? getCredits(email) : null;
  res.json({ credits: c });
});

// ---------- MLS (sandbox) ----------
function mlsEnabled() {
  return String(process.env.MLS_SANDBOX_ENABLED || "false") === "true";
}
app.get("/mls/providers", (req, res) => {
  if (!mlsEnabled()) return res.json({ providers: [] });
  const conn = req.session?.mls || null;
  res.json({
    providers: [{ id: "sandbox", name: "Sandbox", connected: !!(conn && conn.provider === "sandbox") }],
  });
});
app.get("/mls/status", (req, res) => {
  if (!mlsEnabled()) return res.status(404).json({ error: "MLS disabled" });
  const conn = req.session?.mls || null;
  res.json({ connected: !!conn, provider: conn?.provider || null });
});
app.post("/mls/connect", (req, res) => {
  if (!mlsEnabled()) return res.status(404).json({ error: "MLS disabled" });
  req.session.mls = { provider: "sandbox", connected_at: Date.now() };
  res.json({ ok: true });
});
app.post("/mls/disconnect", (req, res) => {
  if (!mlsEnabled()) return res.status(404).json({ error: "MLS disabled" });
  req.session.mls = null;
  res.json({ ok: true });
});
app.post("/mls/fetch", async (req, res) => {
  if (!mlsEnabled()) return res.status(404).json({ error: "MLS disabled" });
  const conn = req.session?.mls || null;
  if (!conn) return res.status(401).json({ error: "Connect Sandbox first" });
  const { mls_number } = req.body || {};
  if (!mls_number) return res.status(400).json({ error: "mls_number required" });
  const { TEST123 } = await import("./src/mls/fixtures.js");
  if (mls_number !== "TEST123") return res.status(404).json({ error: "Not found" });
  res.json({ record: TEST123 });
});

// ---------- HISTORY & USAGE ----------
app.get("/history", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.json({ items: [] });
  const db = getDb();
  const rows = db
    .prepare("SELECT id, created_at, output_payload FROM generation_jobs WHERE user_email=? ORDER BY created_at DESC LIMIT 20")
    .all(email);
  const items = rows.map(r => ({ id: r.id, created_at: r.created_at, output: JSON.parse(r.output_payload || "{}") }));
  res.json({ items });
});

app.get("/usage", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  const db = getDb();
  const totals = db
    .prepare("SELECT COUNT(*) as jobs, SUM(tokens_prompt) as tp, SUM(tokens_completion) as tc FROM generation_jobs WHERE user_email=?")
    .get(email);
  const events = db
    .prepare("SELECT id, credits_added, stripe_price_id, created_at FROM billing_events WHERE user_email=? ORDER BY created_at DESC LIMIT 10")
    .all(email);
  res.json({ totals, events });
});

// ---------- BRANDS ----------
app.get("/brands", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  res.json({ presets: getBrandPresets(email) });
});

app.post("/brands", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });

  const subscription = getUserSubscription(email);
  const existingCount = getBrandPresets(email).length;
  if (!req.body.id && existingCount >= subscription.max_brands) {
    return res.status(403).json({ error: `Plan limited to ${subscription.max_brands} brand presets. Upgrade to create more.` });
  }

  saveBrandPreset(email, req.body);
  trackUserEvent(email, "brand_preset_saved", { name: req.body.name });
  res.json({ ok: true });
});

app.delete("/brands/:id", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });

  const success = deleteBrandPreset(email, req.params.id);
  if (success) trackUserEvent(email, "brand_preset_deleted", { id: req.params.id });
  res.json({ success });
});

// ---------- TEMPLATES ----------
app.get("/templates", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  res.json({ templates: getPropertyTemplates(email) });
});

app.post("/templates", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });

  const subscription = getUserSubscription(email);
  const userTemplates = getPropertyTemplates(email);
  if (!req.body.id && userTemplates.length >= subscription.max_templates) {
    return res.status(403).json({ error: `Plan limited to ${subscription.max_templates} templates. Upgrade to create more.` });
  }

  savePropertyTemplate(email, req.body);
  trackUserEvent(email, "template_saved", { name: req.body.name, type: req.body.property_type });
  res.json({ ok: true });
});

// ---------- FEEDBACK ----------
app.post("/feedback", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });

  const { jobId, rating, feedback } = req.body || {};
  if (!jobId || !rating) return res.status(400).json({ error: "Job ID and rating required" });

  saveGenerationFeedback(email, jobId, rating, feedback);
  trackUserEvent(email, "feedback_submitted", { jobId, rating });
  res.json({ ok: true });
});

// ---------- BATCH ----------
app.get("/batch", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  const jobs = getUserBatchJobs(email);
  res.json({
    jobs: jobs.map(job => ({
      id: job.id,
      status: job.status,
      total: job.total_properties,
      completed: job.completed_properties,
      created_at: job.created_at,
    })),
  });
});

app.get("/batch/:id", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });

  const job = getBatchJob(email, req.params.id);
  if (!job) return res.status(404).json({ error: "Batch job not found" });

  const results = JSON.parse(job.results || "[]");
  res.json({
    id: job.id,
    status: job.status,
    total: job.total_properties,
    completed: job.completed_properties,
    results,
    created_at: job.created_at,
    updated_at: job.updated_at,
  });
});


  trackUserEvent(email, "batch_started", { batchId, propertyCount: properties.length });
  res.json({ batchId, status: "processing" });
});

// ---------- SUBSCRIPTION MGMT ----------
app.post("/subscription/upgrade", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });

  const { plan } = req.body || {};
  if (!["basic", "pro"].includes(plan)) return res.status(400).json({ error: "Invalid plan" });

  updateUserSubscription(email, plan);
  trackUserEvent(email, "subscription_updated", { plan });
  res.json({ ok: true });
});

// ---------- PDF EXPORT & EMAIL ----------
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
        <ul>${(outputs?.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
        <h3>Social Caption</h3>
        <pre>${escapeHtml(outputs?.social_caption || "")}</pre>
      </div>`;
    const pdf = await renderPdfBuffer({ property, outputs });
    const r = await sendResultsEmail({
      to,
      subject,
      html,
      attachments: [{ filename: "listing_package.pdf", content: pdf }],
    });
    res.json({ ok: true, id: r?.id || null });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c]
  );
}

// ---------- BOOT ----------
try {
  ensureDb();
  console.log("Database initialized");
} catch (err) {
  console.error("Failed to initialize database:", err);
  process.exit(1);
}

const server = app.listen(PORT, HOST, () => {
  console.log(`AI Listing Agent v1.3 on http://${HOST}:${PORT}`);
  console.log(`Health: http://${HOST}:${PORT}/health`);
  console.log(`UI: http://${HOST}:${PORT}/app`);
});

// Graceful shutdown
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => { console.error("Uncaught:", err); shutdown("uncaughtException"); });
process.on("unhandledRejection", (r, p) => { console.error("Unhandled:", r, p); shutdown("unhandledRejection"); });

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieSession from "cookie-session";
import rateLimit from "express-rate-limit";
import { ensureDb, getDb, getOrCreateUserByEmail, getCredits, decrementCredit, createUser, findUserByEmail, recordBillingEvent, getBrandPreset, saveBrandPreset, getBrandPresets, deleteBrandPreset, getPropertyTemplates, savePropertyTemplate, getUserSubscription, updateUserSubscription, saveGenerationFeedback, trackUserEvent, getUserAnalytics, createBatchJob, updateBatchJob, getBatchJob, getUserBatchJobs } from "./src/db.js";
import { generateListing } from "./src/generation.js";
import { createCheckoutSession, handleWebhook, reconcileSession } from "./src/billing.js";
import { processBatchProperties, validateBatchProperties } from "./src/batchProcessor.js";
import { getAdminAnalytics, getUserAnalyticsData } from "./src/analyticsService.js";
import { renderPdfBuffer } from "./src/export.js";
import { sendResultsEmail } from "./src/email.js";

import { photosUpload } from "./src/middleware/upload.js";
import { analyzeImages } from "./src/vision/index.js";
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


const photoLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
app.post("/photos/analyze", photoLimiter, photosUpload, async (req, res) => {
  try {
    const enabled = String(process.env.USE_PHOTO_FACTS || "false") === "true";
    if (!enabled) return res.status(400).json({ error: "Photo analysis disabled. Set USE_PHOTO_FACTS=true." });
    const email = req.session?.user?.email || null;
    if (!email) return res.status(401).json({ error: "Login required" });
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "No images uploaded" });
    const results = await analyzeImages(files);
    res.json(results);
  } catch (e) { res.status(400).json({ error: String(e) }); }
});
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
  const subscription = email ? getUserSubscription(email) : null;
  res.json({ email, credits, subscription });
});

// --- Billing: create Checkout Session (requires login) ---

// --- Billing verify (redirect reconciliation) ---
app.get("/billing/verify", async (req,res)=>{
  try{
    const session_id = req.query.session_id;
    const email = req.session?.user?.email || null;
    if (!session_id || !email) return res.status(400).json({ ok:false, error:"Missing session or login" });
    const out = await reconcileSession({ session_id, email });
    res.json({ ok:true, reconciled: out.reconciled, credits_added: out.credits || 0 });
  }catch(e){
    console.error("verify failed", e);
    res.status(400).json({ ok:false, error:String(e) });
  }
});

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

// --- Enhanced Generate route ---
app.post("/generate", limiter, async (req, res) => {
  try {
    const body = req.body || {};
    const email = req.session?.user?.email || null;
    const variations = parseInt(body.variations) || 1;
    const guestCredits = Number(process.env.FREE_CREDITS_GUEST || 3);

    if (email) {
      // Ensure user exists with default email credits
      getOrCreateUserByEmail(email, Number(process.env.FREE_CREDITS_EMAIL || 5));
      const available = getCredits(email) || 0;
      const creditsNeeded = variations; // Each variation costs 1 credit
      
      if (available < creditsNeeded) {
        return res.status(402).json({ error: "Not enough credits", need_credits: true, required: creditsNeeded, available });
      }
    }

    const result = await generateListing({ ...body, user: { email } });

    if (email) {
      // Deduct credits equal to number of variations
      for (let i = 0; i < variations; i++) {
        const ok = decrementCredit(email);
        if (!ok) return res.status(402).json({ error: "Not enough credits", need_credits: true });
      }
      
      // Track generation event  
      try {
        trackUserEvent(email, 'listing_generated', { 
          variations, 
          propertyType: body.property?.type,
          template: body.template_id 
        });
      } catch (e) {
        console.log("Event tracking failed:", e.message);
      }
    }

    // Handle single result or multiple variations
    if (result.variations) {
      res.json({ 
        ...result.variations[0], 
        jobId: result.jobId,
        variations: result.variations,
        flags: result.flags, 
        tokens: result.tokens, 
        model: result.model 
      });
    } else {
      res.json({ 
        ...result, 
        variations: [result],
        flags: result.flags, 
        tokens: result.tokens, 
        model: result.model 
      });
    }
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

function mlsEnabled() { return String(process.env.MLS_SANDBOX_ENABLED || "false") === "true"; }
app.get("/mls/providers", (req, res) => {
  if (!mlsEnabled()) return res.json({ providers: [] });
  const conn = req.session?.mls || null;
  res.json({ providers: [{ id: "sandbox", name: "Sandbox", connected: !!(conn && conn.provider === "sandbox") }] });
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


// --- Enhanced Brand presets ---
app.get("/brands", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  const presets = getBrandPresets(email);
  res.json({ presets });
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
  trackUserEvent(email, 'brand_preset_saved', { name: req.body.name });
  res.json({ ok: true });
});

app.delete("/brands/:id", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const success = deleteBrandPreset(email, req.params.id);
  if (success) {
    trackUserEvent(email, 'brand_preset_deleted', { id: req.params.id });
  }
  res.json({ success });
});

// --- Templates API ---
app.get("/templates", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  const templates = getTemplatesByUser(email);
  res.json({ templates });
});

app.post("/templates", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const subscription = getUserSubscription(email);
  const existingCount = getTemplatesByUser(email).length;
  
  if (!req.body.id && existingCount >= subscription.max_templates) {
    return res.status(403).json({ error: `Plan limited to ${subscription.max_templates} templates. Upgrade to create more.` });
  }
  
  const template = createTemplate(email, req.body);
  trackUserEvent(email, 'template_created', { name: req.body.name, type: req.body.property_type });
  res.json({ template });
});

// --- Analytics API ---
app.get("/analytics", async (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const subscription = getUserSubscription(email);
  if (!subscription?.analytics_access) {
    return res.status(403).json({ error: "Analytics requires Pro subscription" });
  }
  
  const analytics = await getAnalytics(email);
  res.json(analytics);
});

// --- Feedback API ---
app.post("/feedback", async (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const { jobId, rating, feedback } = req.body;
  await submitFeedback(email, jobId, rating, feedback);
  res.json({ success: true });
});

// --- Batch Processing API ---
app.get("/batch", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const jobs = getBatchJobsByUser(email);
  res.json({ jobs });
});

app.post("/batch/process", async (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const subscription = getUserSubscription(email);
  if (!subscription?.analytics_access) {
    return res.status(403).json({ error: "Batch processing requires Pro subscription" });
  }
  
  const { properties } = req.body;
  const batchId = await processBatch(email, properties);
  res.json({ batchId });
});

// --- Subscription Management ---
app.post("/subscription/upgrade", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const { plan } = req.body;
  if (plan === 'pro') {
    updateUserSubscription(email, 'pro');
    trackUserEvent(email, 'subscription_upgraded', { plan: 'pro' });
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Invalid plan" });
  }
});

// Legacy brand endpoint for backward compatibility
app.get("/brand", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  const presets = getBrandPresets(email);
  const defaultPreset = presets.find(p => p.is_default) || presets[0] || null;
  res.json({ preset: defaultPreset });
});

// --- Property Templates ---
app.get("/templates", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  const templates = getPropertyTemplates(email);
  res.json({ templates });
});

app.post("/templates", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const subscription = getUserSubscription(email);
  const userTemplates = getPropertyTemplates(email).filter(t => t.user_email === email);
  
  if (!req.body.id && userTemplates.length >= subscription.max_templates) {
    return res.status(403).json({ error: `Plan limited to ${subscription.max_templates} templates. Upgrade to create more.` });
  }
  
  savePropertyTemplate(email, req.body);
  trackUserEvent(email, 'template_saved', { name: req.body.name, type: req.body.property_type });
  res.json({ ok: true });
});

// --- Feedback & AI Learning ---
app.post("/feedback", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const { jobId, rating, feedback } = req.body;
  if (!jobId || !rating) return res.status(400).json({ error: "Job ID and rating required" });
  
  saveGenerationFeedback(email, jobId, rating, feedback);
  trackUserEvent(email, 'feedback_submitted', { jobId, rating });
  res.json({ ok: true });
});

// --- Batch Processing ---
app.post("/batch/process", async (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const subscription = getUserSubscription(email);
  if (!subscription.batch_processing) {
    return res.status(403).json({ error: "Batch processing requires Pro plan" });
  }
  
  const { properties } = req.body;
  const validationErrors = validateBatchProperties(properties);
  if (validationErrors.length > 0) {
    return res.status(400).json({ errors: validationErrors });
  }
  
  // Check credits
  const credits = getCredits(email);
  if (credits < properties.length) {
    return res.status(402).json({ error: `Insufficient credits. Need ${properties.length}, have ${credits}` });
  }
  
  // Create batch job
  const batchId = createBatchJob(email, properties);
  
  // Process asynchronously
  processBatchProperties(batchId, properties, email).catch(console.error);
  
  trackUserEvent(email, 'batch_started', { batchId, propertyCount: properties.length });
  res.json({ batchId, status: 'processing' });
});

app.get("/batch/:id", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const job = getBatchJob(email, req.params.id);
  if (!job) return res.status(404).json({ error: "Batch job not found" });
  
  const results = JSON.parse(job.results || '[]');
  res.json({
    id: job.id,
    status: job.status,
    total: job.total_properties,
    completed: job.completed_properties,
    results: results,
    created_at: job.created_at,
    updated_at: job.updated_at
  });
});

app.get("/batch", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const jobs = getUserBatchJobs(email);
  res.json({ jobs: jobs.map(job => ({
    id: job.id,
    status: job.status,
    total: job.total_properties,
    completed: job.completed_properties,
    created_at: job.created_at
  })) });
});

// --- Subscription Management ---
app.post("/subscription/upgrade", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const { plan } = req.body;
  if (!['basic', 'pro'].includes(plan)) {
    return res.status(400).json({ error: "Invalid plan" });
  }
  
  updateUserSubscription(email, plan);
  trackUserEvent(email, 'subscription_updated', { plan });
  res.json({ ok: true });
});

// --- Analytics ---
app.get("/analytics", (req, res) => {
  const email = req.session?.user?.email || null;
  if (!email) return res.status(401).json({ error: "Login required" });
  
  const subscription = getUserSubscription(email);
  if (!subscription.analytics_access) {
    return res.status(403).json({ error: "Analytics requires Pro plan" });
  }
  
  const data = getUserAnalyticsData(email);
  res.json(data);
});

// --- Admin Analytics ---
app.get("/admin/analytics", (req, res) => {
  const email = req.session?.user?.email || null;
  // Simple admin check - in production this should be more robust
  const isAdmin = email && (email.endsWith('@replit.com') || email === process.env.ADMIN_EMAIL);
  
  if (!isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  
  const timeframe = req.query.timeframe || '30d';
  const analytics = getAdminAnalytics(timeframe);
  res.json(analytics);
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
  return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[c]));
}

// Health check endpoint for deployment
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.3.0",
    env: process.env.NODE_ENV || "development",
    port: PORT,
    host: HOST
  });
});

// Additional health check routes for different deployment systems
app.get("/healthz", (req, res) => res.status(200).json({ status: "ok" }));
app.get("/ping", (req, res) => res.status(200).send("pong"));
app.get("/", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    // In production, serve the health check on root as well
    res.status(200).json({ 
      status: "healthy", 
      app: "AI Listing Agent",
      version: "1.3.0"
    });
  } else {
    // In development, serve the frontend
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

const server = app.listen(PORT, HOST, () => {
  console.log(`AI Listing Agent v1.3 on http://${HOST}:${PORT}`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

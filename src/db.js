import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "data", "app.db");
let db;

export function ensureDb() {
  if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      credits INTEGER DEFAULT 5,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY,
      user_email TEXT,
      input_payload TEXT,
      output_payload TEXT,
      flags_json TEXT,
      tokens_prompt INTEGER,
      tokens_completion INTEGER,
      model TEXT,
      status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,
      user_email TEXT,
      credits_added INTEGER,
      stripe_checkout_id TEXT,
      stripe_price_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function getDb() { if (!db) ensureDb(); return db; }

export function getOrCreateUserByEmail(email, defaultCredits = 5) {
  if (!email) return null;
  const db = getDb();
  const ins = db.prepare(`INSERT INTO users (id, email, credits)
                          VALUES (lower(hex(randomblob(16))), ?, ?)
                          ON CONFLICT(email) DO NOTHING`);
  ins.run(email, defaultCredits);
  return db.prepare("SELECT * FROM users WHERE email=?").get(email);
}

export async function createUser(email, password, startingCredits = 5) {
  const db = getDb();
  const existing = db.prepare("SELECT email FROM users WHERE email=?").get(email);
  if (existing) throw new Error("Email already registered");
  const hash = await bcrypt.hash(password, 10);
  db.prepare(`INSERT INTO users (id, email, password_hash, credits)
              VALUES (lower(hex(randomblob(16))), ?, ?, ?)`)
    .run(email, hash, startingCredits);
  return { email };
}

export async function findUserByEmail(email, password) {
  const db = getDb();
  const row = db.prepare("SELECT email, password_hash FROM users WHERE email=?").get(email);
  if (!row?.password_hash) return false;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (ok) db.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE email=?").run(email);
  return ok;
}

export function getCredits(email) {
  if (!email) return null;
  const row = getDb().prepare("SELECT credits FROM users WHERE email=?").get(email);
  return row ? row.credits : null;
}

export function decrementCredit(email) {
  if (!email) return true; // guest mode not tracked
  const res = getDb().prepare("UPDATE users SET credits = credits - 1 WHERE email=? AND credits > 0").run(email);
  return res.changes > 0;
}

export function addCredits(email, n) {
  if (!email) return false;
  const res = getDb().prepare("UPDATE users SET credits = credits + ? WHERE email=?").run(n, email);
  return res.changes > 0;
}

export function recordBillingEvent({ email, credits_added, stripe_checkout_id, stripe_price_id }) {
  getDb().prepare(`INSERT INTO billing_events (id, user_email, credits_added, stripe_checkout_id, stripe_price_id)
                   VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)`)
    .run(email, credits_added, stripe_checkout_id, stripe_price_id);
}


export function ensureEnhancedTables() {
  const db = getDb();
  
  // Enhanced brand presets with multi-brand support
  db.exec(`CREATE TABLE IF NOT EXISTS brand_presets (
    id TEXT PRIMARY KEY,
    user_email TEXT,
    name TEXT DEFAULT 'Default',
    voice TEXT,
    reading_level TEXT,
    keywords TEXT,
    company_name TEXT,
    agent_name TEXT,
    phone TEXT,
    email_signature TEXT,
    custom_disclaimers TEXT,
    specializations TEXT,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);

  // Property templates
  db.exec(`CREATE TABLE IF NOT EXISTS property_templates (
    id TEXT PRIMARY KEY,
    user_email TEXT,
    name TEXT,
    property_type TEXT,
    description TEXT,
    template_data TEXT,
    is_shared INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);

  // User subscriptions and roles
  db.exec(`CREATE TABLE IF NOT EXISTS user_subscriptions (
    user_email TEXT PRIMARY KEY,
    plan TEXT DEFAULT 'basic',
    max_brands INTEGER DEFAULT 1,
    max_templates INTEGER DEFAULT 5,
    ai_learning_enabled INTEGER DEFAULT 0,
    batch_processing INTEGER DEFAULT 0,
    analytics_access INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT
  );`);

  // User feedback for AI learning
  db.exec(`CREATE TABLE IF NOT EXISTS generation_feedback (
    id TEXT PRIMARY KEY,
    generation_job_id TEXT,
    user_email TEXT,
    rating INTEGER,
    feedback_text TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);

  // Analytics tracking
  db.exec(`CREATE TABLE IF NOT EXISTS user_analytics (
    id TEXT PRIMARY KEY,
    user_email TEXT,
    event_type TEXT,
    event_data TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );`);
  
  // Batch processing jobs
  db.exec(`CREATE TABLE IF NOT EXISTS batch_jobs (
    id TEXT PRIMARY KEY,
    user_email TEXT,
    status TEXT DEFAULT 'pending',
    total_properties INTEGER,
    completed_properties INTEGER DEFAULT 0,
    results TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);
}
ensureEnhancedTables();

export function getBrandPreset(email) {
  if (!email) return null;
  return getDb().prepare("SELECT voice, reading_level, keywords FROM brand_presets WHERE user_email=?").get(email);
}

// Enhanced Brand Preset Functions
export function getBrandPresets(email) {
  if (!email) return [];
  return getDb().prepare("SELECT * FROM brand_presets WHERE user_email=? ORDER BY is_default DESC, name").all(email);
}

export function saveBrandPreset(email, preset) {
  if (!email) return false;
  const db = getDb();
  const { id, name, voice, reading_level, keywords, company_name, agent_name, phone, email_signature, custom_disclaimers, specializations, is_default } = preset;
  
  const kw = Array.isArray(keywords) ? keywords.join(", ") : (keywords || "");
  const specs = Array.isArray(specializations) ? specializations.join(", ") : (specializations || "");
  
  if (id) {
    // Update existing
    db.prepare(`UPDATE brand_presets SET name=?, voice=?, reading_level=?, keywords=?, company_name=?, agent_name=?, 
                phone=?, email_signature=?, custom_disclaimers=?, specializations=?, is_default=?, updated_at=CURRENT_TIMESTAMP 
                WHERE id=? AND user_email=?`)
      .run(name || 'Default', voice, reading_level, kw, company_name, agent_name, phone, email_signature, custom_disclaimers, specs, is_default ? 1 : 0, id, email);
  } else {
    // Create new
    const newId = `brand_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    db.prepare(`INSERT INTO brand_presets (id, user_email, name, voice, reading_level, keywords, company_name, 
                agent_name, phone, email_signature, custom_disclaimers, specializations, is_default)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId, email, name || 'Default', voice, reading_level, kw, company_name, agent_name, phone, email_signature, custom_disclaimers, specs, is_default ? 1 : 0);
  }
  
  // Ensure only one default per user
  if (is_default) {
    db.prepare("UPDATE brand_presets SET is_default=0 WHERE user_email=? AND id!=?").run(email, id || newId);
  }
  
  return true;
}

export function deleteBrandPreset(email, id) {
  if (!email || !id) return false;
  const res = getDb().prepare("DELETE FROM brand_presets WHERE id=? AND user_email=?").run(id, email);
  return res.changes > 0;
}

// Property Templates Functions
export function getPropertyTemplates(email) {
  if (!email) return [];
  return getDb().prepare("SELECT * FROM property_templates WHERE user_email=? OR is_shared=1 ORDER BY usage_count DESC, name").all(email);
}

export function savePropertyTemplate(email, template) {
  if (!email) return false;
  const db = getDb();
  const { id, name, property_type, description, template_data, is_shared } = template;
  
  if (id) {
    // Update existing
    db.prepare(`UPDATE property_templates SET name=?, property_type=?, description=?, template_data=?, 
                is_shared=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_email=?`)
      .run(name, property_type, description, JSON.stringify(template_data), is_shared ? 1 : 0, id, email);
  } else {
    // Create new
    const newId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    db.prepare(`INSERT INTO property_templates (id, user_email, name, property_type, description, template_data, is_shared)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(newId, email, name, property_type, description, JSON.stringify(template_data), is_shared ? 1 : 0);
  }
  
  return true;
}

export function incrementTemplateUsage(templateId) {
  getDb().prepare("UPDATE property_templates SET usage_count = usage_count + 1 WHERE id=?").run(templateId);
}

// User Subscription Functions
export function getUserSubscription(email) {
  if (!email) return null;
  let sub = getDb().prepare("SELECT * FROM user_subscriptions WHERE user_email=?").get(email);
  if (!sub) {
    // Create default basic subscription
    getDb().prepare(`INSERT INTO user_subscriptions (user_email, plan) VALUES (?, 'basic')`).run(email);
    sub = { user_email: email, plan: 'basic', max_brands: 1, max_templates: 5, ai_learning_enabled: 0, batch_processing: 0, analytics_access: 0 };
  }
  return sub;
}

export function updateUserSubscription(email, plan) {
  if (!email) return false;
  const planConfig = {
    basic: { max_brands: 1, max_templates: 5, ai_learning_enabled: 0, batch_processing: 0, analytics_access: 0 },
    pro: { max_brands: 5, max_templates: 20, ai_learning_enabled: 1, batch_processing: 1, analytics_access: 1 }
  };
  
  const config = planConfig[plan] || planConfig.basic;
  const db = getDb();
  
  db.prepare(`INSERT INTO user_subscriptions (user_email, plan, max_brands, max_templates, ai_learning_enabled, batch_processing, analytics_access)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_email) DO UPDATE SET plan=excluded.plan, max_brands=excluded.max_brands, 
              max_templates=excluded.max_templates, ai_learning_enabled=excluded.ai_learning_enabled, 
              batch_processing=excluded.batch_processing, analytics_access=excluded.analytics_access`)
    .run(email, plan, config.max_brands, config.max_templates, config.ai_learning_enabled, config.batch_processing, config.analytics_access);
  
  return true;
}

// Feedback Functions
export function saveGenerationFeedback(email, jobId, rating, feedback) {
  if (!email || !jobId) return false;
  const id = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  getDb().prepare(`INSERT INTO generation_feedback (id, generation_job_id, user_email, rating, feedback_text)
                   VALUES (?, ?, ?, ?, ?)`)
    .run(id, jobId, email, rating, feedback);
  return true;
}

// Analytics Functions
export function trackUserEvent(email, eventType, eventData) {
  if (!email) return;
  const id = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  getDb().prepare(`INSERT INTO user_analytics (id, user_email, event_type, event_data)
                   VALUES (?, ?, ?, ?)`)
    .run(id, email, eventType, JSON.stringify(eventData));
}

export function getUserAnalytics(email, limit = 100) {
  if (!email) return [];
  return getDb().prepare("SELECT * FROM user_analytics WHERE user_email=? ORDER BY timestamp DESC LIMIT ?")
    .all(email, limit);
}

// Batch Processing Functions
export function createBatchJob(email, properties) {
  const id = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  getDb().prepare(`INSERT INTO batch_jobs (id, user_email, total_properties, results)
                   VALUES (?, ?, ?, ?)`)
    .run(id, email, properties.length, JSON.stringify([]));
  return id;
}

export function updateBatchJob(id, status, completedCount, results) {
  getDb().prepare(`UPDATE batch_jobs SET status=?, completed_properties=?, results=?, updated_at=CURRENT_TIMESTAMP
                   WHERE id=?`)
    .run(status, completedCount, JSON.stringify(results), id);
}

export function getBatchJob(email, id) {
  return getDb().prepare("SELECT * FROM batch_jobs WHERE id=? AND user_email=?").get(id, email);
}

export function getUserBatchJobs(email) {
  if (!email) return [];
  return getDb().prepare("SELECT * FROM batch_jobs WHERE user_email=? ORDER BY created_at DESC LIMIT 20").all(email);
}

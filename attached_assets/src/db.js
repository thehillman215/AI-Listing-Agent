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


export function ensureBrandPresetsTable() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS brand_presets (
    user_email TEXT PRIMARY KEY,
    voice TEXT,
    reading_level TEXT,
    keywords TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);
}
ensureBrandPresetsTable();

export function getBrandPreset(email) {
  if (!email) return null;
  return getDb().prepare("SELECT voice, reading_level, keywords FROM brand_presets WHERE user_email=?").get(email);
}

export function saveBrandPreset(email, { voice, reading_level, keywords }) {
  if (!email) return false;
  const db = getDb();
  const kw = Array.isArray(keywords) ? keywords.join(", ") : (keywords || "");
  db.prepare(`INSERT INTO brand_presets (user_email, voice, reading_level, keywords)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(user_email) DO UPDATE SET voice=excluded.voice, reading_level=excluded.reading_level, keywords=excluded.keywords, updated_at=CURRENT_TIMESTAMP`)
    .run(email, voice || null, reading_level || null, kw);
  return true;
}

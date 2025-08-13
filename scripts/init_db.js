import { ensureDb, getDb } from "../src/db.js";
ensureDb();
const db = getDb();
const row = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table'").get();
console.log("DB ready. Tables count:", row.c);

import fs from "fs";

const FILE = "server.js";
if (!fs.existsSync(FILE)) {
  console.error("server.js not found. Run this in your project root.");
  process.exit(1);
}

const s = fs.readFileSync(FILE, "utf8");

// Find key positions
const appMatch = s.match(/const\s+app\s*=\s*express\(\s*\)\s*;?/);
const appPos = appMatch ? appMatch.index + appMatch[0].length : -1;

const webhookPos = s.search(/app\.post\(\s*["']\/stripe\/webhook["']/);
const hasRaw = s.includes('express.raw({ type: "application/json" })') || s.includes('express.raw({type:"application/json"})');

const jsonPos = s.search(/app\.use\(\s*express\.json\(/);

// Report
const hasApp = appPos >= 0;
const hasWebhook = webhookPos >= 0;
const hasJson = jsonPos >= 0;

console.log("Found const app =", hasApp);
console.log("Found /stripe/webhook route =", hasWebhook);
console.log("Webhook uses express.raw =", hasRaw);
console.log("Found app.use(express.json) =", hasJson);

let pass = true;

if (!hasWebhook) {
  console.log("FAIL: No /stripe/webhook route found.");
  pass = false;
}
if (!hasRaw) {
  console.log("FAIL: Webhook is not using express.raw({ type: \"application/json\" }).");
  pass = false;
}
if (hasWebhook && hasJson && !(webhookPos < jsonPos)) {
  console.log("FAIL: /stripe/webhook is after express.json. It must be before.");
  pass = false;
}

if (pass) {
  console.log("PASS: Webhook ordering and raw-body look correct.");
  process.exit(0);
} else {
  process.exit(2);
}

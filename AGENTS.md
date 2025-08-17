# VectorBid — AGENTS.md (Agent Playbook)

This playbook is the single source of truth for **agentic editing, planning, and PRs** on VectorBid. It reflects the latest design materials you added (data‑flow v0.1 and the UAL bid package PDF). If repo contents diverge from this file, prefer this file and open an issue to reconcile.

> **Mission:** Convert pilot intent (persona + free text + sliders) into **valid, explainable PBS bid layers**. The pipeline is:
>
> **parse → validate → optimize → generate → lint → export**

---

## 0) Actors and Roles
- **ChatGPT (GPT‑5 Thinking + Codex)** — primary repo agent for planning, code edits, tests, PRs, and docs.
- **Claude** — Artifacts (UI mocks, YAML rule packs, diagrams) and PR author/reviewer.
- **Replit (IDE)** — execution environment. Agents must provide copy‑pasteable commands, use **Replit Secrets** for env vars, and avoid background daemons.
- **Optional (when requested):** Notion for backlog/roadmap and Canva for quick visuals; do not add new tools without a stated benefit.

Keep PRs small and atomic. Always update tests and docs in the same PR.

### 0.1 Owner Task Cadence (non‑technical)
- Present **no more than 1–2 action items** at a time with plain‑English steps and copy‑paste commands.
- Include a short **Go/No‑Go** prompt before proceeding to multi‑file changes.
- If more than two items are required, propose a mini‑plan and wait for approval.
- Prefer reversible changes and branch isolation to minimize churn.

---

## 1) Hard Guardrails (non‑negotiable)
1. **Payments OFF** until explicitly enabled: `PAYMENTS_ENABLED=0`. No real charges/fulfillment. Return **503** with `{ ok:false, reason:"payments_disabled" }` for checkout.
2. **No scraping** airline crew portals. Use user‑provided files, fixtures, or lawful docs only.
3. **No live PBS calls.** Output offline exports a pilot can paste into PBS.
4. **Secrets** never committed. Use `.env.local` (git‑ignored) and keep `.env.sample` current.
5. **Determinism**: scripts must be idempotent; stable JSON field order where feasible.

---

## 2) Repository Shape (target)
```
/                      root project (Next.js, ESM)
  pages/api/           API routes (health, ping, stripe/*, pipeline endpoints)
  lib/                 server utilities (pure functions)
  components/          UI (if present)
  schemas/             JSON Schemas (profile, rule_pack, bid_plan, bid_layer)
  config/              rule packs, fixtures, lexicons, test data
    fixtures/
      bid_packages/    parsed bid‑package JSON artifacts
      examples/        example profiles/personas and expected exports
  docs/                architecture, ADRs (include data‑flow v0.1)
  tests/               JS/TS tests (Vitest or Jest)
  engine/              optional Python engine (optimizer/ingest)
    ingest/            bid‑package parsers
    scripts/           benches and CLIs
  scripts/             repo maintenance CLIs
```

**Runtime:** Node 20+.
**Pkg mgr:** `npm`.
**Formatting:** Prettier.
**Lint:** ESLint.
**Typecheck:** `tsc --noEmit` (ok to no‑op if not TS).

---

## 3) Canonical Commands
Run these verbatim; do not invent new commands unless you also update this section.

> **Replit IDE constraints:** Run commands in the Shell. Set secrets via *Tools → Secrets* and reference them as env vars. Avoid interactive prompts, long‑running background services, or watchers that don’t exit. If a custom port is required, export `PORT=3000`.

**Install**
```bash
npm ci
```

**Dev**
```bash
npm run dev
```

**Quality Gates**
```bash
npm run lint
npm run format
npm run typecheck
npm test
```

**Build**
```bash
npm run build
```

**Deploy (Vercel)**
- Push any branch → preview build.
- Treat previews as public or supply Bypass Token header.

**Stripe (disabled mode)**
```bash
curl -s https://<preview>.vercel.app/api/ping
curl -s https://<preview>.vercel.app/api/health
curl -s -X POST https://<preview>.vercel.app/api/stripe/create-checkout-session   # expect 503
curl -s -X POST https://<preview>.vercel.app/api/stripe/webhook -H "Stripe-Signature: test" -d '{}'  # expect 200
```

---

## 4) Environment Variables (`.env.sample`)
```
NODE_ENV=development
PAYMENTS_ENABLED=0

# Stripe (test only)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Preview control
NEXT_PUBLIC_PREVIEW_BYPASS_TOKEN=

# Optional LLMs (use mocks in tests)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=

# Storage / DB (optional for artifacts)
DATABASE_URL=
```

---

## 5) API Endpoints (Phase 1–2)
- `GET /api/ping` → `{ ok: true }`
- `GET /api/health` → `{ ok: true, service:"health", commit, uptime }`
- `POST /api/stripe/create-checkout-session` → **503** when payments disabled.
- `POST /api/stripe/webhook` → **200** logging `payments_disabled` (raw body).  
  Next.js pages API raw body:
```js
export const config = { api: { bodyParser: false } };
```

**Pipeline endpoints (stubs allowed in v0):**
- `POST /api/parse` → BidPlan
- `POST /api/validate` → violations
- `POST /api/optimize` → ranked objectives
- `POST /api/generate` → BidLayer[]
- `POST /api/lint` → warnings/suggestions
- `POST /api/export` → `.txt` payload

---

## 6) Data Contracts (JSON Schemas)
Place these in `/schemas` and validate in tests.

### 6.1 PilotProfile — `schemas/pilot_profile.schema.json`
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PilotProfile",
  "type": "object",
  "required": ["airline","employee_id","base","seat","seniority"],
  "properties": {
    "airline": {"type":"string"},
    "employee_id": {"type":"string"},
    "base": {"type":"string"},
    "seat": {"type":"string","enum":["CA","FO"]},
    "fleet": {"type":"string"},
    "seniority": {"type":"integer","minimum":1},
    "vacation": {"type":"array","items":{"type":"string","pattern":"^\d{4}-\d{2}-\d{2}$"}},
    "constraints": {"type":"array","items":{"$ref":"#/definitions/Constraint"}},
    "preferences": {"type":"string"}
  },
  "definitions": {
    "Constraint": {
      "type":"object",
      "required":["code"],
      "properties": {"code":{"type":"string"},"value":{}}
    }
  }
}
```

### 6.2 RulePack — `schemas/rule_pack.schema.json`
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RulePack",
  "type": "object",
  "required": ["airline","contract_version","fars_version","rules"],
  "properties": {
    "airline": {"type":"string"},
    "contract_version": {"type":"string"},
    "fars_version": {"type":"string"},
    "rules": {"type":"array","items":{
      "type":"object",
      "required":["id","description","predicate"],
      "properties":{
        "id":{"type":"string"},
        "description":{"type":"string"},
        "severity":{"type":"string","enum":["error","warn","info"]},
        "predicate":{"type":"string"}
      }
    }}
  }
}
```

### 6.3 BidPlan — `schemas/bid_plan.schema.json`
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "BidPlan",
  "type": "object",
  "required": ["profile","signals","objectives"],
  "properties": {
    "profile": {"$ref":"pilot_profile.schema.json"},
    "signals": {"type":"object","properties":{
      "bid_package_digest":{"type":"string"},
      "historical_summary":{"type":"string"},
      "persona":{"type":"string"}
    }},
    "objectives": {"type":"array","items":{"type":"string"}}
  }
}
```

### 6.4 BidLayer — `schemas/bid_layer.schema.json`
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "BidLayer",
  "type": "object",
  "required": ["layer_type","filters","priority"],
  "properties": {
    "layer_type": {"type":"string","enum":["pairing","workblock","daysoff","lineconstraint"]},
    "filters": {"type":"object"},
    "priority": {"type":"integer","minimum":1},
    "comment": {"type":"string"}
  }
}
```

---

## 7) Stage Responsibilities

### 7.0 Design & Architecture Review (pre‑PR)
Before coding or after generating new files, take a short review pass:
- Do the files live in the right folders with clear names?
- Does the change actually solve the stated user intent?
- Are schemas, tests, and docs updated together?
- Any obvious simplifications or performance wins?
- Spend an extra **creative 5 minutes** to suggest enhancements.
Only proceed once this checklist is satisfied (document decisions in the PR).


### 7.1 Parse
- Input: free‑text prefs + persona + profile + bid‑package snapshot.
- Output: `BidPlan` JSON (schema‑valid). Unknowns → `notes[]`.
- Ask‑backs when confidence is low or constraints conflict.

### 7.2 Validate
- Input: `BidPlan` + `RulePack`.
- Output: `{ valid, violations[] }`. Pure function, no network I/O.

### 7.3 Optimize
- Input: `BidPlan`.
- Output: ordered objectives and weights. Deterministic tiebreaks.

### 7.4 Generate
- Input: optimized objectives.
- Output: `BidLayer[]` with short `comment` justifying each layer.

### 7.5 Lint & Simulate
- Input: layers.
- Output: `{ ok, warnings[], suggestions[] }`.
- Detect duplicates, unreachable layers, over‑tight windows, or illegal combos.

### 7.6 Export
- Input: layers.
- Output: `.txt` PBS‑ready file (ASCII). Add comments above each block.

**Example block**
```
# Priority 1 — Early AM turns, IAH base, home by 1800 local
LAYER:PAIRING; BASE=IAH; SHOW=LT 06:30; RELEASE=LE 18:00; DAYS=MON,TUE,THU
```

---

## 8) UAL Bid Package Parser Spec (from provided PDF)
Location: `engine/ingest/parse_bid_package.py` (Python) → writes JSON artifacts under `config/fixtures/bid_packages/`.

**Goal:** Convert UAL monthly bid‑package PDF pages into normalized JSON per pairing.

**Normalized JSON (per pairing)**
```json
{
  "pairing_id": "H5001",
  "equip": "37X",
  "base": "IAH",
  "legs": [
    {"flt": "411", "dep_airport": "IAH", "arr_airport": "ORD", "dep_lt": "06:30", "arr_lt": "09:12"},
    {"flt": "2439", "dep_airport": "ORD", "arr_airport": "IAH", "dep_lt": "10:40", "arr_lt": "13:36"}
  ],
  "report_lt": "05:30",
  "release_lt": "13:51",
  "credit": 5.38,
  "taf_b": 8.21,
  "days_pattern": "-MO-----|--",
  "notes": []
}
```

**CLI**
```bash
python -m engine.ingest.parse_bid_package   --pdf ./config/raw/UAL/2024-12/IAH_737.pdf   --out ./config/fixtures/bid_packages/UAL/2024-12/IAH_737.json
```

**Parser rules**
- Treat times as **local‑time strings** (`HH:MM`) but record base timezone in file metadata.
- Coerce decimals like credits/TAFB; missing fields → `null` and append to `notes`.
- Preserve page → pairing mapping for traceability.

**Tests** (`tests/ingest_bid_package.spec.ts` or Python `pytest`)
- Sample asserts for known pairings (e.g., `H5001` exists; `report_lt=="05:30"`; `credit≈5.38`).

---

## 9) Lexicon & Normalization
Add `config/lexicon/aviation.json` with common expansions:
```json
{
  "RPT": "report",
  "RLS": "release",
  "FTM": "flight_time",
  "TAFB": "time_away_from_base",
  "EQP": "equipment",
  "DPT": "dep_lt",
  "ARV": "arr_lt"
}
```
Use this in NLP normalization and in the PDF parser.

---

## 10) LLM Usage Rules
- Prefer tool‑functions + schemas. Temperature ≤ 0.2.
- Always emit JSON matching `/schemas` and validate with AJV (JS) and Pydantic (Python).
- Do **not** invent FARs/CBA. Unknown → `notes` or `violations`.

**Prompt scaffold**
```
System: You are a scheduling strategist. Output only JSON matching the provided schema. No prose.
User: <profile/persona + bid_package_digest>
Assistant: { ...BidPlan JSON... }
```

---

## 11) Tests & CI (minimum)
- Lint, typecheck, unit tests.
- Schema validation for all JSON fixtures in `config/fixtures`.
- Build must pass.
- If `/engine` present: run `pytest -q` and `python engine/scripts/bench_10k.py` (allow to no‑op if absent).

---

## 12) Git Hygiene
- Branches: `feat/*`, `fix/*`, `chore/*`, `docs/*`.
- Conventional Commits.
- PR body checklist:
  - [ ] Linked issue
  - [ ] Updated docs and `.env.sample`
  - [ ] Added/updated tests
  - [ ] Stripe remains disabled
  - [ ] Export sample attached (if pipeline changes)

Optional metadata parsed by workflow:
```
[project]: VectorBid
[area]: API|Engine|UI|Infra|Docs
[component]: Parsing|Validation|Optimizer|Generator|Export|Stripe
[size]: XS|S|M|L
[estimate]: <points>
[risk]: Low|Medium|High
```

---

## 13) Vercel Notes
- Framework: Next.js (ESM). Keep `vercel.json` minimal.
- Keep API handlers < 500 ms when possible.
- Preview protection: public or Bypass Token header.
- Ensure `pages/api/ping.js`, `pages/api/health.js`, `pages/api/stripe/*.js` exist as sanity checks.

---

## 14) Constraints & Mitigations
- **PBS access window** (often first 5 days/mo). Provide offline simulator and forgiving lint with links to docs.
- **Airline variability**: capture `airline`, `contract_version`, `fars_version` in `RulePack`.

---

## 15) Issue Triage for Agents
1. Read `/docs/*` and this file.
2. Write a short plan (impacted files, tests, acceptance criteria).
3. Make the smallest viable change.
4. Open a PR with checklist + how to test locally.

---

## 16) Acceptance Criteria per Stage
- **Parse:** BidPlan schema‑valid with traceable sources.
- **Validate:** Violations accurate on fixtures.
- **Optimize:** Deterministic ranking.
- **Generate:** Layers annotated with comments.
- **Lint & Simulate:** Actionable warnings; near‑zero false positives on fixtures.
- **Export:** Text imports cleanly into PBS in manual tests.

---

## 17) Ownership
- This file governs agent behavior. If conflicting instructions appear elsewhere, follow this and open an issue.

_End of AGENTS.md_

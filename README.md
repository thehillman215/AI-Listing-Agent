# HomeScribe (AI Listing Agent) — v1.3

Generate MLS-ready listing copy with Fair Housing guardrails. Includes **accounts**, **credits & billing**, **history**, **brand presets**, **PDF/email export**, and **BYO-MLS sandbox** (prefill by MLS #). Built with a datasource abstraction so real MLS providers (Bridge/Trestle) can be plugged in later.

## Stack

* Node 20 (ESM) + Express
* SQLite (better-sqlite3)
* Stripe Checkout + webhook
* OpenAI SDK
* PDFKit, Resend (email)

---

## Quick start (local or Replit)

```bash
npm install
cp .env.example .env
# Fill required env vars below
npm run init:db
npm run dev
# Health check
# open http://localhost:3000/health  ->  {"ok":true}
```

On **Replit**:

1. Add secrets (see **Environment** below).
2. Run `npm run init:db` once.
3. Start the server with `npm run dev` **or** the Run button (not both).
4. App URL: shown in the Replit webview; health at `/health`.

---

## Features

* **Auth**: email+password, secure cookie session, logout.
* **Credits & Billing**: 20/50/200 credit packs via Stripe Checkout; credits badge; **Billing & Usage** page.
* **Webhook + Fallback**: `/stripe/webhook` fulfills credits; `/billing/verify` reconciles on redirect if webhook lags.
* **History**: last 20 generations per user.
* **Compliance**: flags + **Apply rewrite** (one-click).
* **Brand presets**: save/load voice, reading level, keywords.
* **Exports**: PDF flyer; **Email my results** (Resend).
* **BYO-MLS sandbox**: connect mock provider, prefill with `TEST123`.

---

## Environment

Required:

* `OPENAI_API_KEY`
* `SESSION_SECRET`

Stripe:

* `STRIPE_SECRET_KEY` (test or live; **server-side secret**, `sk_...`)
* `CREDIT_PRICE_20`, `CREDIT_PRICE_50`, `CREDIT_PRICE_200` (Stripe **Price IDs**, `price_...`)
* `STRIPE_WEBHOOK_SECRET` (from the webhook endpoint, `whsec_...`)
* `STRIPE_SUCCESS_URL` (e.g., `https://<host>/?success=true`)
* `STRIPE_CANCEL_URL`  (e.g., `https://<host>/?canceled=true`)

MLS (BYO & future real providers):

* `MLS_SANDBOX_ENABLED` (`true` to show the mock provider)
* `MLS_REDIRECT_BASE` (optional; base URL for OAuth callbacks if needed later)
* `BRIDGE_CLIENT_ID`, `BRIDGE_CLIENT_SECRET`, `BRIDGE_SCOPE`, `BRIDGE_BASE_URL` (stubs)
* `TRESTLE_CLIENT_ID`, `TRESTLE_CLIENT_SECRET`, `TRESTLE_SCOPE`, `TRESTLE_BASE_URL` (stubs)

Email (optional):

* `RESEND_API_KEY`, `SENDER_EMAIL`

Misc:

* `FREE_CREDITS_EMAIL`, `FREE_CREDITS_GUEST`
* `RATE_LIMIT_PER_MIN`
* `MODEL_NAME`, `USE_RESPONSES_API`

> Never commit `.env` or DB files. `.gitignore` excludes them.

---

## Stripe setup (test mode)

1. **Create Prices** for each credit pack (one-time, fixed amount). Copy the **Price IDs** (`price_...`) into:

   * `CREDIT_PRICE_20`, `CREDIT_PRICE_50`, `CREDIT_PRICE_200`
2. **Webhook endpoint** (Stripe → Developers → Webhooks):
   `https://<your-host>/stripe/webhook`
   Events: `checkout.session.completed`
   Copy **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
3. **Redirects**: set
   `STRIPE_SUCCESS_URL = https://<your-host>/?success=true`
   `STRIPE_CANCEL_URL  = https://<your-host>/?canceled=true`
4. **Test flow**:

   * Log in, start checkout (Starter) → Stripe URL
   * Pay with `4242 4242 4242 4242` (any future expiry/CVC/ZIP)
   * On return you land back in-app; credits increase
   * `/usage` lists the purchase
   * If webhook is delayed, the app calls `/billing/verify?session_id=...` on return to reconcile credits

**Important:** On Replit, preview hosts can change. If the host changes, update:

* Stripe webhook **endpoint URL**
* `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`

---

## MLS (BYO-MLS sandbox + future real providers)

* Set `MLS_SANDBOX_ENABLED=true`.
* In **Settings → MLS**, connect **Sandbox**.
* In **Generator**, enter MLS # `TEST123` → **Prefill from MLS**.
  The datasource abstraction is in `src/datasources/`. Real providers (Bridge/Trestle/MLS Grid) can be added there without changing UI.

---

## API routes (high level)

Auth:

* `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /me`

Generation:

* `POST /generate` (rate-limited), **Apply rewrite** built into UI

Billing:

* `POST /billing/checkout` (returns Stripe Checkout URL)
* `POST /stripe/webhook` (**must** use `express.raw({type:"application/json"})` before any `express.json`)
* `GET /billing/verify` (reconciles on redirect if webhook lagged)
* `GET /usage` (totals + recent purchases)

MLS (BYO):

* `GET /mls/providers`, `GET /mls/status`, `POST /mls/connect`, `GET /mls/callback/:provider`, `POST /mls/disconnect`, `POST /mls/fetch`

Misc:

* `GET /health`

---

## Development scripts

```bash
npm run init:db   # create tables
npm run dev       # start (nodemon)
npm run check     # lightweight sanity task
```

---

## Troubleshooting

* **“You did not provide an API key” on checkout**
  `STRIPE_SECRET_KEY` missing or wrong. Set `sk_test_...` and restart.

* **`Unknown or unconfigured pack`**
  A `CREDIT_PRICE_*` env var is missing or not a **Price** ID (`price_...`).

* **Webhook 404 / “Cannot POST /” in Stripe dashboard**
  Your endpoint isn’t `/stripe/webhook` or host is outdated. Fix the URL.

* **`Webhook signature verification failed`**
  `STRIPE_WEBHOOK_SECRET` doesn’t match your endpoint’s **Signing secret**, or the webhook route isn’t using `express.raw(...)` **before** `express.json()`.

* **Credits didn’t show after paying**
  Check Stripe → Webhooks → the endpoint shows **2xx** delivery. If delayed, the return page calls `/billing/verify` to reconcile.

* **Port 3000 in use (EADDRINUSE)**
  Don’t run both Replit **Run** and `npm run dev`. Stop one.

* **Replit host changed**
  Update webhook endpoint + `STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL`.

---

## New in v1.3

* **/billing/verify** fallback to reconcile credits on redirect (idempotent with unique index).
* Stripe docs/runbook for **Replit** (ephemeral host handling).
* BYO-MLS sandbox flow documented; provider stubs ready for Bridge/Trestle.

---

## License

TBD.
### Vision (Photo-to-Facts)
Set `USE_PHOTO_FACTS=true` to enable the photo analyzer route.

Env:
- `VISION_PROVIDER` (default `restb`)
- `RESTB_API_KEY` (when Restb.ai is enabled)
- `RESTB_BASE_URL` (default `https://api.restb.ai`)
- `VISION_MAX_IMAGES` (default `10`)
- `VISION_MIN_CONF` (default `0.55`)

API:
- `POST /photos/analyze` — upload 1–10 images (`images` form field). Auth required. Returns rooms/features + compliance flags. Returns 400 if disabled.

# AI Listing Agent — v1.1

MVP that generates MLS-ready listing copy with Fair Housing guardrails — now with **accounts**, **history**, **credits badge**, and a **Billing & Usage** page. Architected with a datasource abstraction so MLS integration is a plug-in later.

## Quick start
```bash
npm install
cp .env.example .env
# Add OPENAI_API_KEY, SESSION_SECRET, Stripe keys and Price IDs
npm run init:db
npm run dev
# open http://localhost:3000
```

### Accounts
- Sign up / Log in with **email + password** (hash stored in SQLite).
- Session via encrypted cookies. Logout clears session.
- Credits are tracked per account.

### Credits & Billing
- Buy **20/50/200** credits via **Stripe Checkout**.
- Webhook (`/stripe/webhook`) fulfills by adding credits to your account email.
- Credits badge in header, and a Billing & Usage page showing totals & recent purchases.

### History
- Last 20 generations listed for your account with date/time and preview.

### MLS-ready
- `src/datasources/` exposes `getPropertyContext()`.
- Default source returns minimal derived data (city/state).
- Later: drop in a Bridge/Trestle/MLS Grid provider without changing UI or prompts.

## Environment
- `FREE_CREDITS_EMAIL` & `FREE_CREDITS_GUEST` control starting credit balances.
- `RATE_LIMIT_PER_MIN` throttles `/generate` to protect abuse.
- `MODEL_NAME` + `USE_RESPONSES_API` control OpenAI usage.

## Stripe Setup (test mode)
1. Create **one-time Prices** for 20/50/200 credit packs; paste their IDs into `.env`.
2. Add webhook endpoint to `/stripe/webhook` with event `checkout.session.completed` and paste **Signing secret** into `.env`.
3. Set success/cancel URLs.
4. Use test card `4242 4242 4242 4242` to simulate purchases.


## New in v1.2
- One‑click **Apply rewrite** for flagged phrases
- **Brand presets** (save/load voice, reading level, keywords)
- **PDF flyer** export (`/export/pdf`)
- **Email my results** via Resend (`/email`)
- **Onboarding checklist** on first visit
- **.gitignore** and **GitHub Actions CI** scaffold

## Email (Resend)
- Add `RESEND_API_KEY` and `SENDER_EMAIL` to `.env` to enable the Email button.

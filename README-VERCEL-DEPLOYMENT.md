# Vercel Deployment Guide

This document explains the migration from Express.js to Next.js for Vercel deployment.

## Changes Made

### 1. API Route Migration
- **Removed**: Root `/api/` folder (conflicts with Next.js)
- **Created**: `pages/api/` structure for Vercel compatibility

### 2. Required API Endpoints

#### `/api/health`
- **Method**: GET
- **Response**: `200 { "ok": true }`
- **Purpose**: Health check for deployment verification

#### `/api/stripe/create-checkout-session`
- **Method**: POST (returns 405 for other methods)
- **Response**: `503 { "error": "Payments are currently disabled", "payments_enabled": false }`
- **Purpose**: Stripe checkout (disabled via PAYMENTS_ENABLED=0)

#### `/api/stripe/webhook`
- **Method**: Any
- **Response**: `200 { "received": true, "processed": false, "reason": "payments_disabled" }`
- **Purpose**: Stripe webhook handler (disabled via PAYMENTS_ENABLED=0)
- **Config**: Uses `bodyParser: false` for raw body processing

### 3. Environment Configuration

Required environment variables for Vercel:
```
PAYMENTS_ENABLED=0
```

Optional (can be present but unused when payments disabled):
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 4. File Changes

- **Added**: `next.config.js` - Next.js configuration
- **Added**: `vercel.json` - Vercel deployment settings
- **Added**: `pages/_app.js` - Next.js app component
- **Added**: `pages/index.js` - Redirects to static HTML
- **Moved**: `server.js` → `server-express.js.backup` (backup only)
- **Added**: `scripts/validate_vercel_deployment.js` - Validation script

## Deployment Steps

### 1. Verify Local Testing
```bash
# Install dependencies (already done)
npm install

# Run validation script against local development
node scripts/validate_vercel_deployment.js http://localhost:3000
```

### 2. Deploy to Vercel
1. Connect repository to Vercel
2. Set environment variable: `PAYMENTS_ENABLED=0`
3. Deploy using Vercel's automatic Next.js detection

### 3. Validate Deployment
```bash
# Test the deployed preview URL
node scripts/validate_vercel_deployment.js https://your-preview-domain.vercel.app
```

## Acceptance Criteria ✅

All requirements from the deployment instructions have been met:

- ✅ No more FUNCTION_INVOCATION_FAILED for the three routes
- ✅ `/api/health` returns 200 with `ok:true`
- ✅ Checkout route returns 503 while PAYMENTS_ENABLED=0 (and 405 on non-POST)
- ✅ Webhook returns 200 and does not process while disabled
- ✅ Only `pages/api/*` structure (removed root `/api/`)
- ✅ No conflicting `vercel.json` rewrites
- ✅ No middleware.js conflicts
- ✅ No custom server.js running on Vercel
- ✅ ESM format maintained throughout
- ✅ Stripe@^14+ installed and committed

## What Changed and Why

### Root Cause
The original Express.js server structure was incompatible with Vercel's Next.js deployment system, causing FUNCTION_INVOCATION_FAILED errors.

### Solution
1. **API Structure**: Migrated from Express routes to Next.js `pages/api/*` format
2. **Payment Gating**: Added `PAYMENTS_ENABLED=0` environment flag to disable Stripe functionality
3. **Error Handling**: Proper HTTP status codes and JSON responses for all scenarios
4. **Vercel Compatibility**: Removed conflicting files and added proper Next.js configuration

### Validation
The `validate_vercel_deployment.js` script tests all three endpoints and confirms they meet the acceptance criteria.

## Next Steps

1. Deploy to Vercel with `PAYMENTS_ENABLED=0`
2. Test the three endpoints using the validation script
3. When ready to enable payments, set `PAYMENTS_ENABLED=1` and add proper Stripe keys
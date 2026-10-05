# AutoBrand AI v1.6.4

This release consolidates all v1.6.x production fixes and adds consistent social-account readiness enforcement across composer, diagnostics, MCP/channel workspaces and the background publisher.


## v1.6.4 first install / lockfile refresh

This source archive intentionally does not ship the stale pre-v1.6.4 `package-lock.json`. On a networked development machine run `npm install --include=optional` once, verify both full and production audits, then commit the generated lockfile. After that, production/Render should use `npm ci --include=optional && npm audit --omit=dev` for deterministic installs.

# AutoBrand AI Social SaaS

AutoBrand AI is a social media management SaaS for building a brand brain, connecting social accounts, creating platform-ready content, scheduling posts, managing handoff/approval workflows, and routing AI work through plan-aware providers.

This build keeps the existing architecture and adds the production-readiness layer requested in the final SaaS platform prompt: database-backed plans, plan-aware billing, admin plan tools, safer errors, AI routing with hosted-provider HTTP adapters, expanded Brand Brain data, composer validation services, handoff/approval services, and seed scripts.


## v1.6 final production hardening

The v1.6 production candidate completes the final application-side hardening pass: privileged-admin MFA, signed GridFS media URLs with migration support, ingestion of remote media into controlled user-selected storage, expanded deletion/privacy cleanup, Brain worker deployment wiring, and a public SEO/AI-discovery layer with canonical metadata, sitemap, structured data, crawler policy and private-route noindex boundaries.

See [`docs/FINAL-PRODUCTION-AUDIT.md`](docs/FINAL-PRODUCTION-AUDIT.md), [`docs/SEO-AI-DISCOVERY.md`](docs/SEO-AI-DISCOVERY.md), and [`docs/SECURITY.md`](docs/SECURITY.md).

## ChatGPT / MCP connector

AutoBrand AI v1.6.4 includes a native, OAuth-protected remote MCP connector for ChatGPT and other compatible MCP clients. The connector is a thin adapter over AutoBrand's existing workspace RBAC, media storage, scheduling, provider publishing, retries, analytics and audit infrastructure. It does **not** maintain a second set of social-provider credentials or bypass normal brand permissions.

The connector supports brand/account discovery, durable media ingestion, draft creation/editing, immediate publishing, scheduled publishing/cancellation, post status and analytics. Generated or uploaded creative files are ingested into AutoBrand first and referenced by durable AutoBrand media IDs, avoiding temporary third-party preview URLs.

Production MCP configuration is documented in [`docs/MCP-CONNECTOR.md`](docs/MCP-CONNECTOR.md). Keep `MCP_ENABLED=false` until the public HTTPS issuer/resource URLs, dedicated OAuth secret and deployment checks are complete.


## v1.3 social operating system

AutoBrand is organized around one customer workflow: **Create → Store → Approve → Schedule/Publish → Measure → Improve**. The v1.3 dashboard reduces navigation noise around that workflow and adds:

- a dedicated workspace for every supported social network, with connection health, recent posts, publishing success/failure, 30-day performance and next-step recommendations;
- Google Drive integration using the narrow `drive.file` permission, with per-user storage preference: AutoBrand, Google Drive, or both;
- ChatGPT/Codex as an optional AI operator through AutoBrand's OAuth-protected MCP connector;
- durable ChatGPT media ingestion so generated/uploaded images and videos can be stored in AutoBrand, Google Drive, or both before publishing;
- Superadmin mode with all platform features, plan limits and AutoBrand AI credit limits unlocked;
- the US$10 **Publish** tier (database slug remains `manual-publisher` for compatibility), which includes ChatGPT connector access, Drive, scheduling, approvals and channel analytics while carrying zero included AutoBrand generative-AI credits.

See [`docs/SOCIAL-OPERATING-SYSTEM.md`](docs/SOCIAL-OPERATING-SYSTEM.md), [`docs/MCP-CONNECTOR.md`](docs/MCP-CONNECTOR.md), and [`docs/INTEGRATION-SETUP.md`](docs/INTEGRATION-SETUP.md).


## v1.4 billing and AI cost controls

AutoBrand v1.4 hardens the commercial contract behind every plan. Active subscriptions now carry an immutable snapshot of the price, currency, included credits, limits, features and AI policy purchased for that access period. New catalogue edits therefore affect future purchases without silently changing an existing paid contract.

Higher-price upgrades use unused-period proration and activate only after verified Pesapal payment. Lower-price and equal-price branch switches are scheduled for the current period end. Text-model calls now reserve a conservative token budget before provider execution, cap provider output, reconcile provider-reported usage afterward, and automatically expire abandoned reservations after crashes.

See [`docs/BILLING-AND-TOKEN-BUDGETS.md`](docs/BILLING-AND-TOKEN-BUDGETS.md) for the exact source-of-truth and lifecycle rules.

## Requirements

- Node.js 24 LTS (the project pins `24.x` for deterministic hosting builds)
- MongoDB
- Optional Redis for faster BullMQ dispatch and rate-limit counters; MongoDB remains the shared fallback
- Optional Cloudinary account for uploads
- OAuth/API apps for the social platforms you want to enable

## Setup

```bash
npm ci
cp .env.example .env
```

Fill at least these values in `.env`:

```env
NODE_ENV=development
PORT=3200
APP_URL=http://localhost:3200
MONGO_URI=mongodb://127.0.0.1:27017/autobrand_ai
JWT_ACCESS_SECRET=replace_with_a_long_random_value
JWT_REFRESH_SECRET=replace_with_a_long_random_value
COOKIE_SECRET=replace_with_a_long_random_value
CSRF_SECRET=replace_with_a_long_random_value

SUPERADMIN_NAME=Super Admin
SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_PASSWORD=<choose-a-strong-unique-password>
SUPERADMIN_ALLOW_PROMOTION=false
```

Production seeding never falls back to a built-in superadmin email/password. Creating the superadmin requires an explicit strong `SUPERADMIN_PASSWORD`; promoting an existing non-superadmin account additionally requires `SUPERADMIN_ALLOW_PROMOTION=true`.

Then seed the database and start the app:

```bash
npm run seed
npm run dev
```

Open:

```text
http://localhost:3200
http://localhost:3200/health
```


### Existing MongoDB databases upgraded from older builds

v1.0.5 can safely upgrade the legacy non-unique Payment `provider + reference` index that caused `IndexKeySpecsConflict` during startup. AutoBrand first checks for duplicate financial references. If none exist, startup replaces the old index with `uniq_payment_provider_reference` automatically. If duplicates exist, it stops without deleting financial data; run `npm run migrate:production` to inspect `paymentReferenceUniqueness`, back up the database, and resolve the duplicate payments through finance review before applying the migration.

## Required scripts

```bash
npm run dev
npm start
npm run seed
npm run seed:plans
npm run seed:superadmin
npm run seed:permissions
npm run lint
npm test
```

Additional seeders:

```bash
npm run seed:platform-rules
npm run seed:ai-providers
```

## Single dashboard UX

The app now uses one dashboard route structure. User-facing product pages live at `/dashboard/:page` such as `/dashboard/content-library`, `/dashboard/media`, `/dashboard/social`, `/dashboard/billing`, and `/dashboard/settings`. Legacy root feature URLs such as `/posts`, `/media`, `/billing`, `/settings`, `/admin`, and `/content-library` are no longer mounted; they return a clear 404 that points users to the correct dashboard page. Authenticated mutations and integration callbacks live under `/dashboard/actions/...`, while checkout is under `/dashboard/billing/...`.

Feature navigation is calculated from the signed-in user role plus the current `SubscriptionPlan`. Role-blocked pages are hidden. Plan-locked pages remain visible with an upgrade/billing state, so users understand what their plan unlocks without leaving the dashboard.

## Dynamic plans

Plans are now stored in MongoDB through `SubscriptionPlan`. The default matrix includes:

- Free Trial
- Publish (US$10 for 1 month of access; bring your own creative or connect ChatGPT/Codex; Google Drive + scheduling + approvals + analytics; zero included AutoBrand generative-AI credits; no automatic renewal)
- AI Starter (US$10 for 1 month of access, generative AI included; no automatic renewal)
- Growth
- Pro
- Business
- Agency
- Superadmin

Seed plans with:

```bash
npm run seed:plans
```

Plan data is used by:

- landing pricing cards
- `/pricing`
- signup selected-plan flow
- billing checkout flow
- usage/limit services
- admin plan management
- AI routing defaults
- queue priority metadata

Admin plan management routes:

```text
/dashboard/plans
/dashboard/plans?mode=create
/dashboard/actions/admin/plans/:id
/dashboard/actions/admin/plans/:id?_method=PUT
```

Only Superadmin can permanently delete plans. Plans with subscriptions are soft-deleted/deactivated to avoid breaking existing subscribers.

## Billing configuration

Billing is Pesapal-only in production. Set:

```env
BILLING_PROVIDER=pesapal
CHECKOUT_DEFAULT_PROVIDER=pesapal
PESAPAL_ENVIRONMENT=sandbox
PESAPAL_CONSUMER_KEY=
PESAPAL_CONSUMER_SECRET=
PESAPAL_IPN_ID=
PESAPAL_CALLBACK_URL=https://your-domain.com/dashboard/billing/pesapal/callback
PESAPAL_IPN_URL=https://your-domain.com/dashboard/billing/pesapal/ipn
```

Customer checkout routes:

```text
GET  /dashboard/billing/checkout/:planSlug
POST /dashboard/billing/checkout/:planSlug
GET  /dashboard/billing/pesapal/callback
POST /dashboard/billing/pesapal/ipn
```

## AI provider configuration

Controllers should route AI work through `src/services/ai/ai.service.js`. Provider-specific logic belongs under `src/services/ai/providers/`.

Supported provider slugs:

- openai
- gemini
- deepseek
- groq
- anthropic
- mistral
- replicate
- stability
- fal

Seed provider configs with:

```bash
npm run seed:ai-providers
```

Then fill the provider keys/models you plan to use:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_IMAGE_MODEL=gpt-image-1

GEMINI_API_KEY=
GEMINI_TEXT_MODEL=gemini-2.5-flash

DEEPSEEK_API_KEY=
DEEPSEEK_TEXT_MODEL=deepseek-chat

GROQ_API_KEY=
GROQ_TEXT_MODEL=llama-3.3-70b-versatile

ANTHROPIC_API_KEY=
ANTHROPIC_TEXT_MODEL=claude-3-5-sonnet-latest

MISTRAL_API_KEY=
MISTRAL_TEXT_MODEL=mistral-large-latest

REPLICATE_API_TOKEN=
STABILITY_API_KEY=
FAL_KEY=
```

Generative AI routing is fail-closed. Only hosted provider adapters are valid AI providers. Missing credentials, unsupported providers, and provider failures remain failures; they are never replaced by deterministic local content. Sharp/FFmpeg template rendering belongs to the zero-credit Publish/media toolchain and consumes no AutoBrand AI credits. The Publish plan can also use a customer-connected ChatGPT/Codex account as an external AI operator without consuming AutoBrand generation credits.

## Social platform APIs

Social integration environment variables and callback paths are documented in `.env.example` and `docs/INTEGRATION-SETUP.md`.

Supported account platforms in this project path:

- Facebook
- Instagram
- LinkedIn
- TikTok
- YouTube
- Google Business Profile
- Pinterest
- X / Twitter
- Threads
- WhatsApp

LinkedIn profile publishing was left unchanged from the previous working checkpoint.

## Brand Brain

The Brand model now supports expanded brand intelligence fields, including assets, colors, fonts, audience data, products/services/offers, FAQs, competitors, voice rules, banned/preferred words, posting defaults, prompts, historical winners, and knowledge-base notes.

Service layer:

```text
src/services/brandBrain/brandContext.service.js
src/services/brandBrain/brandScore.service.js
src/services/brandBrain/brandSuggestion.service.js
src/services/brandBrain/brandAsset.service.js
```

## Smart Composer

Composer helper services were added for platform-aware content work:

```text
src/services/composer/defaultPlatformRules.js
src/services/composer/platformVariation.service.js
src/services/composer/composerValidation.service.js
src/services/composer/contentScore.service.js
src/services/composer/brandFitChecker.service.js
src/services/composer/riskChecker.service.js
```

These services provide platform rules, character/hashtag/media warnings, caption adaptation, scoring, brand-fit checks, and off-brand/risk warnings.

## Handoff and approvals

Added service layer and public approval-token support:

```text
src/services/auto-handoff/handoff.service.js
src/services/approvals/approval.service.js
src/models/ClientApprovalLink.js
```

Public review routes:

```text
GET  /review/:token
POST /review/:token
```

Publishing errors can move eligible auto posts into handoff fallback instead of failing silently.

## Error handling

Centralized error handling was added:

```text
src/middlewares/error.middleware.js
src/utils/AppError.js
src/utils/errorResponse.js
```

Error pages now render through the dashboard error page when the user is in the dashboard, while API/JSON requests receive JSON. Production responses do not expose stack traces.

Error views:

```text
src/views/dashboard/pages/error.ejs
```

## Production checklist

Before hosting:

1. Set `NODE_ENV=production`.
2. Use strong `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, and `CSRF_SECRET` values.
3. Configure a production MongoDB URL.
4. Configure HTTPS and set `APP_URL` to the public domain.
5. Add production OAuth redirect URLs in every provider dashboard.
6. Configure Pesapal billing and verify the callback/IPN URLs.
7. Configure AI provider keys/models by plan.
8. Seed plans, permissions, platform rules, AI providers, and the superadmin.
9. Run `npm run lint` and `npm test`.
10. Check `/health` after deployment.

See `DEPLOYMENT.md` for a hosting-oriented guide.

## Production checkout with Pesapal

This build includes a complete onboarding-to-payment path:

```text
Landing plan card -> /start/:planSlug -> register/login -> /dashboard/billing/checkout/:planSlug -> Pesapal -> callback/IPN -> verified activation
```

For production payments, configure:

```env
BILLING_PROVIDER=pesapal
CHECKOUT_DEFAULT_PROVIDER=pesapal
PESAPAL_ENVIRONMENT=production
PESAPAL_CONSUMER_KEY=your_consumer_key
PESAPAL_CONSUMER_SECRET=your_consumer_secret
PESAPAL_IPN_ID=your_registered_ipn_id
PESAPAL_IPN_URL=https://your-domain.com/dashboard/billing/pesapal/ipn
PESAPAL_CALLBACK_URL=https://your-domain.com/dashboard/billing/pesapal/callback
PESAPAL_CANCELLATION_URL=https://your-domain.com/dashboard/billing?cancelled=1
PESAPAL_REDIRECT_MODE=TOP_WINDOW
```

Paid plans remain pending until Pesapal transaction status verification confirms payment. The IPN route is public and CSRF-exempt so Pesapal can post payment notifications.


## Publishing diagnostics

```bash
npm run diagnose:publishing -- --limit=10
npm run diagnose:publishing -- --limit=10 --live
npm run repair:publishing
```

`--live` verifies the selected Facebook/Instagram provider identities without printing tokens. Generated assets use MongoDB GridFS by default, so restarts do not delete them. Instagram image/carousel publishing still requires a public HTTPS `PUBLIC_APP_URL` (or Cloudinary); localhost is not reachable by Meta. Existing Instagram accounts from older builds must be reconnected once so the repaired flow can verify `instagram_content_publish`.


### Publishing credential stability

Social access tokens are encrypted at rest. Keep `TOKEN_ENCRYPTION_KEY` stable across restarts. Local development automatically persists a missing key outside the repository at `~/.autobrand-ai/token-encryption-key` by default, while production requires an explicit key. Run `npm run repair:publishing` to stop old retry loops and identify accounts that need reconnection.

## Smart publishing destinations and resilient runtime (v7)

Post, campaign, Growth Studio, calendar and handoff forms now use a shared live-destination catalogue. Disconnected, removed, expired, permission-blocked, mock and token-decryption-failed social records remain visible only in Social management and are excluded from publishing forms. Campaigns and generated posts store exact account IDs, and disconnect/removal reconciles existing scheduled content automatically.

See `docs/SOCIAL-INTEGRATIONS.md`, `docs/PUBLISHING-PIPELINE.md`, `docs/BACKGROUND-WORKERS.md`, and `docs/INCIDENT-RECOVERY.md` for destination behavior and runtime recovery.


## Connectivity diagnostics

Redis is optional. Leave `REDIS_ENABLED=false`, `REDIS_URL=` and `REDIS_HOST=` to use MongoDB as the shared publishing and rate-limit fallback. A Redis URL enables Redis automatically; host/port mode requires `REDIS_ENABLED=true` and a real Redis server. Production rate limiting never falls back to per-process memory.

Run this before debugging workers or publishing:

```bash
npm run diagnose:connectivity
```

If MongoDB disconnects, AI generation and scheduled publishing pause with exponential backoff and resume automatically after reconnection. `/health` remains available, `/readyz` reports database readiness, and normal pages return a fast 503 rather than hanging through repeated server-selection timeouts.

## Email delivery without SMTP

The application can run safely before an email provider is connected:

```env
EMAIL_DELIVERY_MODE=optional
EMAIL_VERIFICATION_REQUIRED=false
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
ALLOW_DEVELOPMENT_EMAIL_LINKS=false
```

In this mode, signup and normal platform use remain available. Password reset emails, verification emails, login-email changes, and team invitation emails show a controlled unavailable message rather than crashing the server. To require email verification, configure complete SMTP credentials and switch to `EMAIL_DELIVERY_MODE=required` with `EMAIL_VERIFICATION_REQUIRED=true`.


## Production documentation

The complete architecture, onboarding/plan journey, security, Pesapal billing, workspace RBAC, Publish/BYO-AI workflow, publishing, analytics, workers, migration, deployment and incident runbooks live in [`docs/README.md`](docs/README.md). Treat those documents and the production checklist as part of every release.


## ChatGPT / Codex connector

AutoBrand includes a native OAuth-protected MCP connector for ChatGPT/Codex. See `docs/MCP-CONNECTOR.md`.

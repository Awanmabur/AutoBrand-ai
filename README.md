# AutoBrand AI Social SaaS

AutoBrand AI is a social media management SaaS for building a brand brain, connecting social accounts, creating platform-ready content, scheduling posts, managing handoff/approval workflows, and routing AI work through plan-aware providers.

This build keeps the existing architecture and adds the production-readiness layer requested in the final SaaS platform prompt: database-backed plans, plan-aware billing, admin plan tools, safer errors, AI routing with hosted-provider HTTP adapters, expanded Brand Brain data, composer validation services, handoff/approval services, and seed scripts.

## Requirements

- Node.js 20 or newer
- MongoDB
- Optional Redis for future BullMQ workers and cache-backed jobs
- Optional Cloudinary account for uploads
- OAuth/API apps for the social platforms you want to enable

## Setup

```bash
npm install
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
SUPERADMIN_PASSWORD=ChangeThisPassword123!
```

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
- Starter
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

- local
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

The local provider is a deterministic fallback for development and safe failure handling. Hosted adapters now make real HTTP/API calls when the matching API key is configured, and they fail with safe messages when a provider is missing or unavailable.

## Social platform APIs

Existing social integration environment placeholders remain in `.env.example` and `INTEGRATION_SETUP.md`.

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

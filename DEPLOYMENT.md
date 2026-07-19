# Deployment Guide

This guide covers the production deployment path for AutoBrand AI.

## 1. Environment

On a platform with its own environment dashboard (Render, Railway, Heroku, Fly.io), enter these as environment variables there — do not upload a `.env` file. On a VPS, copy `.env.example` to `.env` on the server and fill it in. Either way, never commit a real `.env` and never reuse your local development secrets in production.

Minimum production values:

```env
NODE_ENV=production
PORT=3200
APP_URL=https://your-domain.com
MONGO_URI=mongodb+srv://...
JWT_ACCESS_SECRET=long-random-secret
JWT_REFRESH_SECRET=long-random-secret
COOKIE_SECRET=long-random-secret
CSRF_SECRET=long-random-secret
WEBHOOK_SECRET=long-random-secret
SUPERADMIN_NAME=Super Admin
SUPERADMIN_EMAIL=admin@your-domain.com
SUPERADMIN_PASSWORD=long-initial-password
```

Generate each random secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. `WEBHOOK_SECRET` is required — the webhook endpoint rejects all requests without it (see `src/controllers/webhookController.js`).

Use HTTPS for all OAuth redirect URLs in production.

`ENABLE_SCHEDULED_PUBLISHING` defaults to `false` — scheduled posts stay in `scheduled` status and never auto-publish until this is set to `true`. Turn it on deliberately when you're ready for the scheduler to actually go live, not before.

## 2. Install and verify

```bash
npm install --omit=dev
npm run lint
npm test
```

For platforms where production installs omit dev dependencies, run lint/test in CI before deploying the production image.

## 3. Seed production data

```bash
npm run seed
```

This seeds:

- subscription plans
- admin roles and permissions
- superadmin
- platform content rules
- default AI provider configs

You can also run the seeders individually:

```bash
npm run seed:plans
npm run seed:permissions
npm run seed:superadmin
npm run seed:platform-rules
npm run seed:ai-providers
```

## 4. Configure OAuth/social APIs

For each platform, create an app in the provider dashboard and add the production callback URLs shown in `.env.example` and `INTEGRATION_SETUP.md`.

Common examples:

```text
https://your-domain.com/auth/google/callback
https://your-domain.com/dashboard/actions/social/facebook/callback
Use the Facebook/Meta callback at https://your-domain.com/dashboard/actions/social/facebook/callback for Facebook, Instagram, and WhatsApp discovery
https://your-domain.com/dashboard/actions/social/linkedin/callback
https://your-domain.com/dashboard/actions/social/tiktok/callback
https://your-domain.com/dashboard/actions/social/youtube/callback
https://your-domain.com/dashboard/actions/social/google-business/callback
https://your-domain.com/dashboard/actions/social/pinterest/callback
https://your-domain.com/dashboard/actions/social/x/callback
https://your-domain.com/dashboard/actions/social/threads/callback
```

Paste provider client IDs/secrets into `.env` only. Never commit `.env`.

## 5. Configure billing

Configure Pesapal before enabling paid self-service checkout:

```env
BILLING_PROVIDER=pesapal
CHECKOUT_DEFAULT_PROVIDER=pesapal
```

Set the Pesapal consumer key/secret, IPN ID, IPN URL, and callback URL in `.env`. Do not enable paid plans until Pesapal sandbox/live verification succeeds.

## 6. Configure AI routing

OpenAI is the only active provider — every plan tier's `aiConfig` defaults and falls back to `openai`/`local`. Set:

```env
AI_TEXT_PROVIDER=openai
AI_IMAGE_PROVIDER=openai
AI_VIDEO_PROVIDER=openai
OPENAI_API_KEY=
```

Other provider adapters (Gemini, DeepSeek, Groq, Anthropic, Mistral, Replicate, Stability, Fal) exist and are tested, but are inert until you add their env vars — don't set `AI_TEXT_PROVIDER`/etc. to anything but `openai` or `local` unless you've also added that provider's key.

Seed AI provider configs and plans after any change to `src/services/subscription/defaultPlans.js`:

```bash
npm run seed:ai-providers
npm run seed:plans
```

Plan AI routing is stored in `SubscriptionPlan.aiConfig` and `PlanAiConfig`.

## 7. Run the server

```bash
npm start
```

The server includes graceful shutdown handling for SIGINT and SIGTERM. It also runs an in-process scheduler that publishes due posts every 60 seconds — no extra process needed for scheduled publishing.

Separately, retry jobs (queued from the admin console or the composer's retry action) go through a Redis-backed queue that needs its own running process:

```bash
npm run worker
```

On Render/Railway/Fly.io this needs to be configured as a second service (a "background worker" / "worker" process type pointed at `npm run worker`), since those platforms don't read `Procfile` the way Heroku does — check your platform's docs for how it defines additional process types. On Heroku, the `Procfile`'s `worker:` line is picked up automatically; scale it with `heroku ps:scale worker=1`.

Health check:

```text
GET /health
```

## 7b. Heroku-specific steps

```bash
heroku create your-app-name
heroku addons:create heroku-redis:mini
```

The Redis add-on sets a `REDIS_URL` config var automatically — the app reads that directly (falls back to `REDIS_HOST`/`REDIS_PORT` for local dev, so nothing else to configure).

Set every required var from `.env.example` (`APP_URL`, `MONGO_URI`, the 5 secrets, `SUPERADMIN_*`, `PESAPAL_*`, `OPENAI_API_KEY`, each social platform you're enabling):

```bash
heroku config:set NODE_ENV=production APP_URL=https://your-app-name.herokuapp.com ...
```

Push and scale both process types (the `Procfile` already defines `web` and `worker`):

```bash
git push heroku main
heroku ps:scale web=1 worker=1
heroku run npm run seed
```

Eco/Basic dynos sleep after 30 minutes of inactivity — a sleeping web dyno means the in-process post scheduler isn't running either, so scheduled posts on a free/eco plan can be delayed until the next request wakes the dyno. Use a paid dyno tier (or an external uptime ping) if scheduled publishing needs to be reliably on time.

## 8. Reverse proxy notes

Use a reverse proxy such as Nginx, Caddy, Render, Railway, Fly.io, Heroku, or a container platform.

Required proxy settings:

- terminate HTTPS
- forward `Host`
- forward `X-Forwarded-Proto`
- forward `X-Forwarded-For`
- enforce upload size limits that match the app

## 9. Post-deployment smoke test

Check:

1. `/health`
2. public landing page
3. `/pricing`
4. signup with a selected plan
5. Google OAuth signup/login
6. dashboard load
7. Brand Brain create/edit
8. social account connect page
9. billing page
10. admin plans page
11. dashboard 404 page
12. public 404 page

## 10. Operational notes

Recommended next production steps:

- Connect a real email provider (Postmark, SES, Resend, SendGrid) — password reset and email verification are in-app-only until this is wired up; see `src/controllers/authController.js`.
- Run `npm audit fix` in a normal network environment before the first deploy (two known-vulnerable transitive dependencies as of this writing: `form-data`, `morgan`).
- Add analytics collection workers and dashboards.
- Add provider health checks and alerting.

## Pesapal deployment checklist

1. Deploy the app on a public HTTPS domain.
2. Set `APP_URL` and `PUBLIC_APP_URL` to that HTTPS domain.
3. Register `https://your-domain.com/dashboard/billing/pesapal/ipn` in Pesapal and save the returned IPN ID.
4. Set `BILLING_PROVIDER=pesapal` and `CHECKOUT_DEFAULT_PROVIDER=pesapal`.
5. Add `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, and `PESAPAL_IPN_ID`.
6. Set callback and cancellation URLs:
   - `PESAPAL_CALLBACK_URL=https://your-domain.com/dashboard/billing/pesapal/callback`
   - `PESAPAL_CANCELLATION_URL=https://your-domain.com/dashboard/billing?cancelled=1`
7. Run a sandbox payment before switching to `PESAPAL_ENVIRONMENT=production`.
8. Confirm that `/dashboard/billing/pesapal/ipn` returns a JSON response with status `200` after notification processing.

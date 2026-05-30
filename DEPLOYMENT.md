# Deployment Guide

This guide covers the production deployment path for AutoBrand AI.

## 1. Environment

Create a production `.env` from `.env.example` and fill all required values.

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
SUPERADMIN_NAME=Super Admin
SUPERADMIN_EMAIL=admin@your-domain.com
SUPERADMIN_PASSWORD=long-initial-password
```

Use HTTPS for all OAuth redirect URLs in production.

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
https://your-domain.com/social/facebook/callback
https://your-domain.com/social/instagram/callback
https://your-domain.com/social/linkedin/callback
https://your-domain.com/social/tiktok/callback
https://your-domain.com/social/youtube/callback
https://your-domain.com/social/google-business/callback
https://your-domain.com/social/pinterest/callback
https://your-domain.com/social/x/callback
https://your-domain.com/social/threads/callback
```

Paste provider client IDs/secrets into `.env` only. Never commit `.env`.

## 5. Configure billing

Use manual billing first if you have not configured a payment provider:

```env
BILLING_PROVIDER=manual
```

For Stripe, PayPal, or Flutterwave, fill the provider keys in `.env`, configure webhook URLs in the payment provider dashboard, and verify webhook signatures before accepting automated subscription changes.

## 6. Configure AI routing

Seed AI provider configs:

```bash
npm run seed:ai-providers
```

Then configure keys/models:

```env
OPENAI_API_KEY=
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
GROQ_API_KEY=
ANTHROPIC_API_KEY=
MISTRAL_API_KEY=
REPLICATE_API_TOKEN=
STABILITY_API_KEY=
FAL_KEY=
```

Plan AI routing is stored in `SubscriptionPlan.aiConfig` and `PlanAiConfig`.

## 7. Run the server

```bash
npm start
```

The server includes graceful shutdown handling for SIGINT and SIGTERM.

Health check:

```text
GET /health
```

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

- Add Redis-backed BullMQ workers for high-volume AI/media/publishing jobs.
- Turn billing provider scaffolds into provider-specific SDK calls and webhook handlers.
- Add analytics collection workers and dashboards.
- Add provider health checks and alerting.

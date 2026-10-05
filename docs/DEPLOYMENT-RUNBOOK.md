# Deployment Runbook

## Runtime

Use Node.js 24.x as declared in `package.json`. Deploy from the sanitized source tree, never from a developer directory containing `node_modules` or local secrets.

## Install

On the Linux deployment host:

```bash
npm ci --include=optional
npm run preflight:runtime
```

The runtime preflight verifies Node 24, Linux Sharp loading, FFmpeg availability and production environment/security configuration.

## Verify before rollout

```bash
npm run lint
npm test
npm run security:static
npm audit --omit=dev
npm run release:scan
npm run migrate:production       # dry run only
```

Take a database backup before applying migrations. For upgrades from older builds, confirm the dry-run report shows `paymentReferenceUniqueness.duplicateGroups = 0`. Duplicate Payment provider/reference groups require finance review; AutoBrand intentionally does not delete or merge them automatically.

## Apply migration

After reviewing dry-run output:

```bash
npm run migrate:production:apply
```

## Required production classes of configuration

- public HTTPS APP/PUBLIC URL;
- MongoDB URI;
- distinct JWT/cookie/CSRF/webhook/token-encryption secrets;
- Pesapal API 3 credentials and public callback/IPN setup;
- social provider credentials/scopes for integrations being enabled;
- AI provider keys only for AI plans/features being sold;
- SMTP when production email verification/reset/invites are required;
- optional Redis/Cloudinary as selected by the deployment design.

## Start

`npm start` automatically runs `prestart`; in production that invokes the runtime preflight and fails closed when native media dependencies or environment controls are invalid.

## Post-deploy validation

Check `/readyz`, sign-in and the complete onboarding/billing journeys before opening traffic. Verify a Free Trial signup goes directly to welcome/workspace setup; verify a paid Publish or AI Starter signup reviews the exact selected plan, goes through Pesapal, and reaches the same welcome/setup flow only after server-verified payment. Confirm Publish and AI Starter both show US$10 for one month but clearly explain no-AI vs generative-AI, and confirm no page promises automatic renewal or automatic charging. Then test brand/team access, Publish draft/schedule, exact subscription-period usage dates, one controlled provider publish, Pesapal sandbox/live test as appropriate, analytics sync status, worker logs and account deletion scheduling. Never use a real customer payment as the first deployment test.

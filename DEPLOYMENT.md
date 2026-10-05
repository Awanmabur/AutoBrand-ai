
## v1.6.4 social publishing readiness

After deployment run `npm run diagnose:publishing -- --live --limit=20`. Any destination with `readyToPublish: false`, `effectiveStatus: expired|needs_reconnect|missing_permission`, or provider live-check failure must be reconnected through AutoBrand before scheduled publishing resumes. Historical `/uploads/ai/...` files that no longer exist are old ephemeral-disk artifacts; regenerate/re-upload only content you intend to republish.

## v1.6.4 first install / lockfile refresh

This source archive intentionally does not ship the stale pre-v1.6.4 `package-lock.json`. On a networked development machine run `npm install --include=optional` once, verify both full and production audits, then commit the generated lockfile. After that, production/Render should use `npm ci --include=optional && npm audit --omit=dev` for deterministic installs.


> **v1.6.4 dependency refresh:** this release pins the patched direct dependency floors discovered by the live October 2026 npm advisory check (`express 4.22.3`, `ejs 6.0.1`, `morgan 1.12.1`, `nodemailer 10.0.14`, `sharp 0.35.5`, `body-parser 1.20.8`, with `qs 6.16.0` override). Run `npm install --include=optional` once after extraction so npm reconciles the lockfile on a networked host, then run `npm audit --omit=dev`. Commit the refreshed lockfile before switching CI back to `npm ci`.

# AutoBrand AI Deployment Guide

This guide describes the runtime configuration required for publishing, scheduling, AI generation, OAuth callbacks, and public media delivery.

## 1. Required production environment

Set environment variables in the hosting dashboard. Do not commit a real `.env` file.

```env
NODE_ENV=production
PORT=3200
APP_URL=https://your-domain.example
PUBLIC_APP_URL=https://your-domain.example
APP_TIME_ZONE=Africa/Kampala
MONGO_URI=mongodb+srv://...

JWT_ACCESS_SECRET=<unique-random-secret>
JWT_REFRESH_SECRET=<different-random-secret>
COOKIE_SECRET=<different-random-secret>
CSRF_SECRET=<different-random-secret>
WEBHOOK_SECRET=<different-random-secret>
TOKEN_ENCRYPTION_KEY=<different-random-secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

PAUSE_PUBLISHING=false
AI_GENERATION_WORKER_MODE=web

EMAIL_DELIVERY_MODE=optional
EMAIL_VERIFICATION_REQUIRED=false
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
ALLOW_DEVELOPMENT_EMAIL_LINKS=false
```

Generate each secret separately:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`APP_URL` and `PUBLIC_APP_URL` must be the same public HTTPS origin unless a separate public media origin is intentionally used. Provider callbacks and provider-fetched media cannot use localhost.


## Email delivery modes

Email delivery is optional by default so a missing SMTP provider does not stop the platform.

- `EMAIL_DELIVERY_MODE=optional`: start without SMTP. New accounts do not require email verification. Password reset, email change, verification resend, and team invite email delivery remain unavailable until SMTP is configured.
- `EMAIL_DELIVERY_MODE=required`: fail startup unless `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` are all set. Use this when email verification is mandatory.
- `EMAIL_DELIVERY_MODE=disabled`: never send email, even if SMTP variables are present.

For a fully configured production deployment:

```env
EMAIL_DELIVERY_MODE=required
EMAIL_VERIFICATION_REQUIRED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-password
EMAIL_FROM=AutoBrand AI <no-reply@your-domain.example>
ALLOW_DEVELOPMENT_EMAIL_LINKS=false
```

Do not enable `EMAIL_VERIFICATION_REQUIRED=true` without working SMTP.


### Database indexes and legacy index upgrades

Mongoose `autoIndex` is disabled in **all environments**. AutoBrand has one central startup index manager, which creates/verifies declared indexes before the server accepts traffic. This avoids Mongoose's automatic index builder racing with migration-aware upgrades.

The v1.0.5 payment-integrity upgrade specifically handles the legacy `provider_1_reference_1` Payment index. Older databases may have that key pattern as non-unique while current code requires a unique `provider + reference` boundary. Startup now inspects the existing index and first checks the Payment collection for duplicate provider/reference groups. When there are no duplicates, it safely replaces the legacy non-unique index with the stable unique index `uniq_payment_provider_reference`. If duplicates exist, startup fails closed and **does not delete or merge financial records automatically**.

Before a production upgrade, run:

```bash
npm run migrate:production
```

For v1.4.0 this dry-run also reports/backfills immutable subscription/payment commercial snapshots and initializes AI token-budget counters/reservation state for legacy subscriptions. Back up the database and review unresolved snapshot rows before applying.

Review `paymentReferenceUniqueness` in the dry-run report and take a database backup. If `duplicateGroups` is `0`, apply the migration:

```bash
npm run migrate:production:apply
```

If duplicates are reported, resolve them through finance review before applying the migration. Do not work around the failure by dropping the unique requirement.

Critical examples include Pesapal payment references, subscription activation keys, webhook replay keys, analytics sync jobs, refresh-token expiry, team membership uniqueness, and distributed rate-limit buckets.

## 2. Publishing and scheduling runtime

Publishing is a core responsibility of the web process:

- `PAUSE_PUBLISHING=false` keeps publishing active.
- The MongoDB due-post publisher runs automatically after startup.
- Publish-now posts, future schedules, approval releases, campaigns, retries, and recovered stale jobs use the same durable path.
- A sweep runs every `DUE_POST_POLL_MS` milliseconds; the default is 10 seconds.
- Redis is optional. When configured, BullMQ lowers dispatch latency and Redis serves rate-limit counters; MongoDB remains the durable publishing fallback and distributed rate-limit fallback. Production never degrades rate limiting to per-process memory.

Do not use the obsolete `ENABLE_SCHEDULED_PUBLISHING` variable. Old `ENABLE_SCHEDULED_PUBLISHING=false` values are ignored so existing deployments do not silently strand posts. Use `PAUSE_PUBLISHING=true` only for an intentional emergency stop.

Optional tuning:

```env
DUE_POST_POLL_MS=10000
DUE_POST_CONCURRENCY=3
POST_PUBLISH_CONCURRENCY=3
PUBLISHING_STALE_MS=900000
SOCIAL_PROVIDER_TIMEOUT_MS=300000
```

## 3. AI generation runtime

For a normal one-service deployment:

```env
AI_GENERATION_WORKER_MODE=web
AI_GENERATION_POLL_MS=2500
AI_CONTENT_GENERATION_CONCURRENCY=2
AI_VIDEO_GENERATION_CONCURRENCY=1
AI_IMAGE_GENERATION_CONCURRENCY=3
```

The web process then recovers and processes queued AI jobs automatically without blocking HTTP startup.

For a larger deployment with a separate AI worker:

- Web service: `AI_GENERATION_WORKER_MODE=external`
- Worker service command: `npm run worker:ai`

Use `AI_GENERATION_WORKER_MODE=off` only for maintenance. The obsolete `ENABLE_AI_GENERATION_WORKER` and `RUN_AI_GENERATION_WORKER_IN_WEB` variables are no longer required; old false values cannot silently disable the default web worker.

AI generation uses MongoDB and does not require Redis.


## 3A. Pesapal reconciliation runtime

For a normal one-service deployment:

```env
PAYMENT_RECONCILIATION_WORKER_MODE=web
PAYMENT_RECONCILIATION_POLL_MS=60000
PAYMENT_RECONCILIATION_CONCURRENCY=2
PAYMENT_RECONCILIATION_LEASE_MS=300000
PAYMENT_RECONCILIATION_PENDING_DAYS=7
PAYMENT_RECONCILIATION_PAID_DAYS=180
```

This recovers missed/transient callback/IPN processing and periodically detects later Pesapal reversals. For a dedicated worker use `PAYMENT_RECONCILIATION_WORKER_MODE=external` and run `npm run worker:billing`.

Production validation requires `BILLING_PROVIDER=pesapal`, `CHECKOUT_DEFAULT_PROVIDER=pesapal`, `PESAPAL_ENVIRONMENT=production`, consumer credentials, and IPN readiness. Pesapal callback/IPN/cancellation URLs must remain on the `APP_URL` host; a separate `PUBLIC_APP_URL` is only a media/public-origin setting.

## 4. Optional Redis publishing worker

A separate publishing worker is optional and requires Redis:

```env
REDIS_URL=rediss://user:password@host:port
QUEUE_PREFIX=autobrand
```

Worker command:

```bash
npm run worker
```

Do not start the publishing worker without a working Redis configuration. The web process can publish correctly without it.

## 5. Install, validate, and seed

Use the lock file:

```bash
npm ci
npm run lint
npm test
npm run security:static
npm run seed
```

Run verification in CI before deploying when the production platform installs with development tooling omitted.


### Superadmin seeding safety

Set `SUPERADMIN_EMAIL` explicitly before running `npm run seed` or `npm run seed:superadmin` against production. A new superadmin also requires a strong explicit `SUPERADMIN_PASSWORD`; there is no production default. If the configured email already belongs to a non-superadmin user, the seeder refuses privilege escalation unless `SUPERADMIN_ALLOW_PROMOTION=true` is intentionally set after verifying the account.

## 6. Public media storage

External social providers must be able to fetch images and videos over public HTTPS.

Recommended production configuration:

```env
PUBLIC_APP_URL=https://your-domain.example
GENERATED_MEDIA_STORAGE=gridfs
GENERATED_MEDIA_GRIDFS_BUCKET=autobrand_generated_media
# Optional external CDN instead of the built-in MongoDB-backed public media route:
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Generated files are stored in MongoDB GridFS by default and streamed from `/uploads/db/...`, including HTTP byte-range support for video. This prevents Media records from pointing at files deleted by a restart or redeploy. Cloudinary remains optional.

Facebook Page image/video publishing can upload GridFS or local media bytes directly. Instagram image/carousel publishing requires Meta to fetch the asset from a public HTTPS URL, so `PUBLIC_APP_URL` must be a real public HTTPS origin (or Cloudinary must be configured). During local development, use a public HTTPS tunnel for Instagram. A localhost Instagram blocker never cancels an otherwise valid Facebook Page publish.

## 7. OAuth and social apps

Create provider applications and register the exact HTTPS callback URLs from `.env.example`. A callback mismatch, missing permission, expired token, unreviewed app permission, inaccessible media URL, or disconnected account will prevent a real provider publication.

Current version defaults in this build:

```env
FACEBOOK_GRAPH_VERSION=v25.0
LINKEDIN_VERSION=202607
THREADS_GRAPH_VERSION=v1.0
```

Connect real accounts from the dashboard after deployment. Seeded mock accounts are excluded from production composers and cannot be published.

See `docs/INTEGRATION-SETUP.md` for each provider's variables and callback route.


### Existing Meta connections after this repair

Reconnect Facebook/Instagram once from **Dashboard → Social Accounts**. The repaired OAuth flow always requests Facebook Page and Instagram publishing scopes, checks `/me/permissions`, and marks a linked Instagram profile as connected only when Meta actually granted `instagram_basic` and `instagram_content_publish`. Older Instagram records without a verified grant are automatically changed to **Needs reconnect** instead of silently failing.

After deploying, run:

```bash
npm run repair:publishing
npm run diagnose:publishing -- --limit=10 --live
```

## 8. Start commands

One-service deployment:

```bash
npm start
```

Optional process layout:

```text
web:      npm start
worker:   npm run worker       # only with Redis
aiworker: npm run worker:ai    # only when web uses AI_GENERATION_WORKER_MODE=external
billingworker: npm run worker:billing # only when PAYMENT_RECONCILIATION_WORKER_MODE=external
```

Health endpoint:

```text
GET /health
```

Scheduled publishing requires an always-running service. Hosting plans that sleep or scale to zero can delay due posts until the process wakes.

## 9. Production smoke test

After deploying:

1. Confirm `/health` returns success.
2. Confirm startup logs say the due-post publisher is active.
3. Confirm startup logs say the in-web AI worker is active, or confirm the external worker is running.
4. Connect one real social account and verify its status is `connected`, not `mock` or `expired`.
5. Create a text-only post and use Publish now.
6. Confirm the post moves through `scheduled` → `publishing` → `published`, or stores a precise provider error.
7. Schedule a post at least two minutes ahead and verify the UTC database time matches `APP_TIME_ZONE`.
8. Test one public HTTPS image and one video.
9. Restart the service and confirm queued/stale jobs recover.
10. Test approval with “Publish after approval.”


## 10. Publishing diagnosis and recovery

Use the database-backed diagnostic before guessing at provider configuration:

```bash
npm run diagnose:publishing -- --limit=10
```

To also make non-mutating identity requests to the selected Facebook Pages and Instagram profiles:

```bash
npm run diagnose:publishing -- --limit=10 --live
```

The report never prints decrypted tokens. It shows the requested action, post status, selected accounts, token presence/expiry, media files that exist or are missing, per-platform readiness blockers, provider errors, and publish results.

For a database created by an older build, run once after installing dependencies:

```bash
npm run repair:publishing
npm start
```

The repair command requeues completed AI jobs whose generated files disappeared, retries generated-post publish handoffs, and runs the due-post publisher. The normal web service then regenerates requeued media automatically.

When updating an existing installation, preserve the real `.env`, database, and `public/uploads` directory. Do not replace those runtime data files with template values.

## 11. Troubleshooting

A post remaining in `draft` usually means form validation or AI generation did not complete. A post remaining in `pending_approval` still needs approval. A post remaining in `scheduled` beyond the poll interval means the web process is not running, publishing is paused, or MongoDB is unavailable. A post in `failed` contains the provider-specific error in `errorMessage` and `publishResults`.

Expected live logs for Publish now are: `[composer] AI post queued`, `[generation] post handed to publishing`, `[publishing] due-post sweep found work`, `[publishing] provider request starting`, and then provider success/failure. If the first line says `requestedAction: save`, the browser submitted Save draft rather than Publish now. If Instagram reports a public HTTPS media blocker while Facebook is ready, Facebook is still attempted and recorded independently.

Never replace a provider error with a mock success. Fix the account permission, token, callback, media URL, app review, or provider configuration named by the stored error.


## Stable social-token encryption key

`TOKEN_ENCRYPTION_KEY` encrypts Facebook, Instagram and other provider tokens stored in MongoDB. It must remain unchanged across restarts and deployments. Changing or removing it makes existing tokens unreadable.

Generate it once and preserve it in `.env` or the hosting secrets dashboard:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

During a planned rotation, set the new key as `TOKEN_ENCRYPTION_KEY` and keep the old key temporarily in `TOKEN_ENCRYPTION_KEY_PREVIOUS`. In local development only, if the variable is blank, the app persists a key outside the repository at `~/.autobrand-ai/token-encryption-key`; keep that secret-store file if you want local provider connections to survive source replacement. If the old key has already been lost, reconnect provider accounts once after configuring the stable key.

## Connectivity resilience (v7)

Redis is optional. For the standard one-service deployment, it may be left disabled; MongoDB then provides the shared rate-limit and publishing fallback:

```env
REDIS_ENABLED=false
REDIS_URL=
REDIS_HOST=
```

A non-empty `REDIS_URL` enables Redis automatically. Host/port mode requires `REDIS_ENABLED=true` and a running Redis server.

Before starting the app, verify MongoDB and optional Redis reachability:

```bash
npm run diagnose:connectivity
```

During an Atlas outage, `/health` remains `200`, while `/readyz` returns `503` until MongoDB reconnects. AI generation and publishing jobs are not marked failed or rescheduled merely because the database is offline. Workers back off and resume automatically.

Useful tuning variables:

```env
MONGO_WORKER_BACKOFF_MIN_MS=5000
MONGO_WORKER_BACKOFF_MAX_MS=120000
MONGO_WORKER_LOG_INTERVAL_MS=60000
MONGO_SERVER_SELECTION_TIMEOUT_MS=15000
MONGO_CONNECT_TIMEOUT_MS=15000
MONGO_SOCKET_TIMEOUT_MS=45000
MONGO_IP_FAMILY=
```

For Windows `ENOTFOUND` failures, run `ipconfig /flushdns`, then `npm run diagnose:connectivity`. If needed, switch the computer DNS resolver, disable a VPN/proxy temporarily, copy a fresh Atlas Drivers URI, and confirm Atlas Network Access.

## 12. Render deployment and login security

For Render, use these service commands:

```text
Build command: npm ci
Start command: npm start
Health check path: /health
```

The project pins Node.js to `24.x`. Avoid an open-ended engine such as `>=20`, because the host may select a newly released major version before the application and native dependencies have been validated against it.

Set the public origin exactly:

```env
NODE_ENV=production
APP_URL=https://autobrand-ai.onrender.com
PUBLIC_APP_URL=https://autobrand-ai.onrender.com
TRUST_PROXY_HOPS=1
```

`COOKIE_SECRET` and `CSRF_SECRET` must each be stable, distinct values of at least 32 random characters. Do not regenerate either secret on every deploy. Changing `CSRF_SECRET` invalidates existing form tokens; changing authentication secrets invalidates existing sessions.

The production CSRF cookie is named `__Host-autobrand-csrf`. The application removes the legacy `csrfToken` cookie and can recover a same-origin form submission when a browser omits the cookie or retains a stale duplicate. Cross-site submissions and unsigned tokens are still rejected.

After deploying a build that changes cookie/security behavior, perform one hard refresh. Users affected by an older deployment can clear site data for `autobrand-ai.onrender.com` or open a private window once.
## ChatGPT / MCP deployment

The connector is part of the main AutoBrand web service and is exposed at `/mcp`; it does not require a second Node service. Before enabling it in production:

```env
MCP_ENABLED=true
MCP_OAUTH_ISSUER=https://your-autobrand-domain.example
MCP_RESOURCE_URL=https://your-autobrand-domain.example/mcp
MCP_OAUTH_TOKEN_SECRET=<unique-random-32+-character-secret>
MCP_ACCESS_EXPIRES_IN=15m
MCP_REFRESH_EXPIRES_IN=30d
MCP_DYNAMIC_CLIENT_REGISTRATION_ENABLED=true
MCP_MAX_UPLOAD_BYTES=104857600
```

`MCP_OAUTH_TOKEN_SECRET` must be distinct from the normal web/session/provider secrets. Confirm OAuth discovery, MCP Inspector compatibility and test-account publishing before adding the production endpoint to ChatGPT. See `docs/MCP-CONNECTOR.md` and `docs/PRODUCTION-CHECKLIST.md`.



## Google Drive asset storage

Configure a Google OAuth web application with this exact callback:

```text
https://YOUR-AUTOBRAND-DOMAIN/dashboard/settings/google-drive/callback
```

Required environment values:

```env
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_CALLBACK_URL=https://YOUR-AUTOBRAND-DOMAIN/dashboard/settings/google-drive/callback
GOOGLE_DRIVE_SCOPES="openid email profile https://www.googleapis.com/auth/drive.file"
GOOGLE_DRIVE_ROOT_FOLDER_NAME="AutoBrand AI"
```

Use the narrow `drive.file` scope; AutoBrand only needs to work with Drive files/folders created or selected through the app. Test connect, upload, token refresh, media proxy publishing, backup, disconnect and account deletion before production rollout.


## v1.6 final hardening requirements

Generate a distinct media signing secret and privileged-MFA challenge secret:

```env
MEDIA_URL_SIGNING_SECRET=<unique random 48+ byte value>
ALLOW_LEGACY_PUBLIC_GRIDFS_URLS=false
PRIVILEGED_MFA_ENABLED=true
PRIVILEGED_MFA_CHALLENGE_SECRET=<different unique random 48+ byte value>
PRIVILEGED_MFA_EXPIRES_MINUTES=10
```

Privileged MFA requires working SMTP/email delivery. Do not give production administrative access while `PRIVILEGED_MFA_ENABLED=false`.

Before disabling legacy unsigned GridFS URLs, run the production migration. The migration reports `signedGridFsUrls` in dry-run mode and rewrites legacy Media, BrandAsset, AI-video and VideoRender URLs only when `--apply` is used.

If workers are deployed as separate processes, run all enabled modes including the Brain worker:

```text
worker:          node workers/postWorker.js
aiworker:        node workers/aiGenerationWorker.js
analyticsworker: node workers/analyticsSyncWorker.js
billingworker:   node workers/paymentReconciliationWorker.js
brainworker:     node workers/aiBrainWorker.js
```

Set the corresponding `*_WORKER_MODE=external` only when that dedicated worker is actually running; otherwise leave the responsibility in the web process.

For SEO/AI discovery, keep public marketing pages reachable through CDN/WAF bot controls while authenticated/token-bearing paths remain blocked/noindex. See `docs/SEO-AI-DISCOVERY.md`.

## Edge performance and crawler reachability

Put the production app behind a TLS CDN/reverse proxy that supports HTTP/2 or HTTP/3 and Brotli/gzip compression for HTML, CSS, JavaScript, JSON, XML and text responses. Do not cache authenticated dashboard/API responses; respect AutoBrand's `private/no-store` headers. Static assets may be cached/revalidated according to the application headers.

Do not configure bot challenges that block the public SEO/discovery paths (`/`, public marketing pages, `/robots.txt`, `/sitemap.xml`, `/llms.txt`) for search crawlers you intend to support. Keep `/dashboard`, `/auth`, `/mcp`, `/review` and token-bearing media/private paths out of search indexes regardless of CDN configuration.

For media-signing key rotation, put the old key temporarily in `MEDIA_URL_SIGNING_SECRET_PREVIOUS` while `MEDIA_URL_SIGNING_SECRET` contains the new key. New URLs use only the current key; verification accepts the configured previous keys during the migration window. Remove old keys after all still-needed URLs have been regenerated or expired from workflows.

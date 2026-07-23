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

SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM=AutoBrand AI <no-reply@your-domain.example>
```

Generate each secret separately:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`APP_URL` and `PUBLIC_APP_URL` must be the same public HTTPS origin unless a separate public media origin is intentionally used. Provider callbacks and provider-fetched media cannot use localhost.

## 2. Publishing and scheduling runtime

Publishing is a core responsibility of the web process:

- `PAUSE_PUBLISHING=false` keeps publishing active.
- The MongoDB due-post publisher runs automatically after startup.
- Publish-now posts, future schedules, approval releases, campaigns, retries, and recovered stale jobs use the same durable path.
- A sweep runs every `DUE_POST_POLL_MS` milliseconds; the default is 10 seconds.
- Redis is optional. When configured, BullMQ lowers dispatch latency, while MongoDB remains the correctness fallback.

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

See `INTEGRATION_SETUP.md` for each provider's variables and route.


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

During a planned rotation, set the new key as `TOKEN_ENCRYPTION_KEY` and keep the old key temporarily in `TOKEN_ENCRYPTION_KEY_PREVIOUS`. In local development only, if the variable is blank, the app persists a key in `.autobrand-token-key`; keep that file when replacing source code. If the old key has already been lost, reconnect provider accounts once after configuring the stable key.

## Connectivity resilience (v7)

Redis is optional. For the standard one-service deployment, leave it disabled:

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

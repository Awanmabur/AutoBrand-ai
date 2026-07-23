# AutoBrand AI Publishing Implementation Notes

## Lifecycle

```text
composer publish/schedule request
  -> AI job stores requestedAction + selected accounts
  -> generation validates/regenerates real media files
  -> generated post is handed to durable dispatch
  -> MongoDB due publisher atomically claims the post
  -> each selected platform is preflighted independently
  -> provider calls run with bounded concurrency
  -> per-account success/failure is persisted
  -> only failed destinations are retried
```

Redis is optional. MongoDB is the correctness fallback.

## Missing-media recovery

Completed generation jobs are checked for disappeared local output. Missing generated records are archived, the job is returned to `queued`, and the original publish/schedule action is preserved. This is required for ephemeral hosts and for old databases that reference files no longer present under `public/uploads`.

## Multi-platform isolation

Readiness is not all-or-nothing. For example, an Instagram localhost-media blocker does not cancel a valid Facebook Page upload. The post keeps a published result for Facebook and a failed result for Instagram, and retry logic skips Facebook.

## Media delivery

- Facebook Pages: local image/video files can be uploaded directly as bytes.
- Instagram: requires a public HTTPS image/video URL; use Cloudinary or a public tunnel for local development.
- Public origin selection uses the first actually public value from `PUBLIC_APP_URL` and `APP_URL`.

## Runtime diagnostics

```bash
npm run diagnose:publishing -- --limit=10
npm run diagnose:publishing -- --limit=10 --live
npm run repair:publishing
```

The live diagnostic checks Meta identities without printing tokens.

## Default process model

```env
PAUSE_PUBLISHING=false
AI_GENERATION_WORKER_MODE=web
APP_TIME_ZONE=Africa/Kampala
```

The web service owns AI generation and durable publishing by default. Separate Redis/AI workers are optional scale components.

## Resilient Runtime v7

- Redis is opt-in for host/port deployments and auto-enabled by `REDIS_URL`.
- ioredis errors are consumed and throttled; unavailable Redis uses MongoDB fallback.
- Scheduled publishing and AI generation now use shared MongoDB connectivity classification and exponential backoff.
- Workers wake immediately after Mongoose reconnects.
- Database-dependent HTTP traffic fails fast with a clear 503 page during outages.
- Added `npm run diagnose:connectivity` for MongoDB SRV, DNS, TCP, and Redis TCP diagnosis.

## v9 — Optional email runtime

- Added `EMAIL_DELIVERY_MODE=required|optional|disabled`.
- Added `EMAIL_VERIFICATION_REQUIRED`.
- Missing SMTP no longer prevents production startup in optional mode.
- Registration, verification gating, password reset, email change, resend verification, and team invitations now degrade safely when email delivery is unavailable.
- Updated production validation, dashboard status, `.env.example`, deployment documentation, tests, and static security expectations.

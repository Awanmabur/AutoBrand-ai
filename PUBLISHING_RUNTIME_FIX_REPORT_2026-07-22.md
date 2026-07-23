# Publishing and Scheduling Runtime Fix Report

Date: 2026-07-22

## Why the previous build still failed

The failure was not limited to the final provider request. Several independent runtime paths could prevent a post from ever reaching publication:

- old deployment flags could disable the scheduled publisher and AI worker;
- the web server could wait on generation recovery before listening;
- publish-now depended too heavily on a live request/queue path;
- AI media failure could strand otherwise publishable text content;
- approval, campaign, retry, reschedule, and generated-post paths did not all share one durable dispatch contract;
- local media paths were not consistently converted for URL-based providers;
- production composers exposed mock destinations that the publisher later rejected;
- dates generated on a UTC host could differ from Kampala schedule intent;
- X video used obsolete command-style upload routes and did not request `media.write`;
- provider API defaults and deployment documentation were stale;
- composer format normalization could let an incompatible media preset replace the selected post format.

## Runtime architecture after the fix

### Publishing

All immediate and future publish actions now save a versioned scheduled record first. Redis/BullMQ is an optional accelerator. The MongoDB due-post publisher is always the correctness fallback unless `PAUSE_PUBLISHING=true` is explicitly set.

The publisher:

- atomically claims due or stale work;
- checks `scheduleVersion` so obsolete queue jobs cannot publish early;
- rejects unapproved or mock production destinations;
- publishes platform/account jobs with bounded concurrency;
- keeps prior successful destinations during partial retries;
- persists provider errors and per-destination results;
- recovers stale `publishing`, missing-time legacy schedules, and approved `publishAfterApproval` records;
- isolates notification failures from completed publishing state changes.

### AI generation

`AI_GENERATION_WORKER_MODE=web` is now the default. A normal deployment does not require a separate AI worker. Startup recovery runs asynchronously after the HTTP service starts. Old false flags cannot silently disable the worker.

Optional media generation can degrade to user-supplied text for destinations that support text. Media-required destinations still fail clearly rather than publishing invalid content.

### Provider/media handling

- Meta Graph default: `v25.0`.
- LinkedIn version default: `202607`.
- X OAuth includes `media.write`.
- X images use the v2 media upload route.
- X video uses `/media/upload/initialize`, `/{id}/append`, and `/{id}/finalize` before creating the post.
- Existing X accounts connected without `media.write` receive a clear reconnect error.
- TikTok uses Direct Post file upload rather than domain-dependent pull-from-URL.
- Pinterest, Threads, and Google Business convert local paths through `PUBLIC_APP_URL` and reject non-public origins.
- Provider requests have bounded timeouts.

### Scheduling/timezone

Manual schedules, campaigns, best-time schedules, and AI-generated slots use `APP_TIME_ZONE`, defaulting to `Africa/Kampala`, and are stored in UTC.

### Production account selection

Production composer queries include only `connected` accounts. Development may still use mock destinations. The publisher independently rejects mocks in production.

## Deployment variables

Use:

```env
PAUSE_PUBLISHING=false
AI_GENERATION_WORKER_MODE=web
APP_TIME_ZONE=Africa/Kampala
PUBLIC_APP_URL=https://your-public-domain.example
FACEBOOK_GRAPH_VERSION=v25.0
LINKEDIN_VERSION=202607
X_SCOPES=tweet.read tweet.write users.read offline.access media.write
```

The obsolete `ENABLE_SCHEDULED_PUBLISHING`, `ENABLE_AI_GENERATION_WORKER`, and `RUN_AI_GENERATION_WORKER_IN_WEB` settings are no longer needed. Their old false values cannot disable the default runtime.

## Verification completed

- Syntax: 218 JavaScript files passed.
- Static security gate: 217 JavaScript files passed; one review notice remains for a development-only Pesapal local URL.
- Full repository tests: 142 discovered, 135 passed, 7 dependency-load failures, 0 assertion failures.
- Focused publishing/composer/runtime simulations: passed.
- Package-lock dependency tree: valid with `npm ls --package-lock-only --all`.

The seven load failures require installed `mongoose` or `jsonwebtoken`. `npm ci` could not complete because the configured package registry returned HTTP 503. No failed business-logic assertion remains in the tests that could execute.

## Required real-world configuration

Source code cannot create provider permissions. Real publication still requires:

- valid OAuth client IDs/secrets and exact HTTPS callback URLs;
- provider app review/product access where required;
- connected accounts with current user tokens and publishing scopes;
- reconnecting X accounts to grant `media.write`;
- public persistent media, preferably Cloudinary on ephemeral hosting;
- an always-running web service and reachable MongoDB;
- provider-specific eligibility such as linked Instagram Business accounts or TikTok Content Posting access.

Failures from these conditions are now stored as explicit provider errors instead of mock success or indefinite queued state.

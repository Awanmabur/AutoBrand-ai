# Publishing and Scheduling End-to-End Fix

**Date:** 2026-07-22  
**Scope:** Composer, AI generation, immediate publishing, schedules, campaigns, approvals, retries, Redis/BullMQ, MongoDB fallback processing, provider calls, status recovery, and dashboard feedback.

## Root causes corrected

1. Scheduled publishing defaulted to disabled, leaving valid scheduled records untouched.
2. Single-service production deployments could disable the in-web AI generation worker, leaving generated posts unfinished before publishing.
3. Redis reachability checked raw localhost host/port instead of the configured `REDIS_URL`, breaking hosted TLS/authenticated Redis.
4. “Publish now” ran provider requests in the browser request path, causing slow requests and apparent failures.
5. Campaign, approval-release, retry, admin retry, and generated-post paths did not consistently enqueue publish jobs.
6. Rescheduled or cancelled posts could leave stale delayed jobs capable of acting on old state.
7. Queue workers and the database fallback could race without a durable atomic publish claim.
8. Posts stuck in legacy `scheduled` records without a time, or `publishing` after a crashed process, were not repaired reliably.
9. Development mock destinations could produce misleading success behavior; production now requires real connected accounts.
10. Provider HTTP requests had no shared hard timeout, allowing a call to hold a publishing lane indefinitely.
11. The fallback sweep processed posts serially, making later posts late when a provider was slow.
12. Approval-required posts could be scheduled or published through alternate actions without a final independent approval gate.
13. The quick dashboard schedule action lacked an explicit schedule-time field, and live UI refresh did not track due/publishing posts.

## Implementation

- Enabled scheduled publishing and the single-service AI generation worker by default.
- Converted Publish now into a durable immediate scheduled job rather than a blocking provider request.
- Added `scheduleVersion`, `publishingStartedAt`, and `publishingAttemptId` to posts.
- Added deterministic versioned BullMQ job IDs and invalidation on reschedule, cancel, retry, repost, or approval transition.
- Added an atomic MongoDB claim for due/stale posts so multiple workers cannot publish the same attempt concurrently.
- Added a MongoDB due-post fallback that repairs legacy null schedules and recovers stale publishing attempts.
- Reduced the default fallback polling interval to 10 seconds and added bounded concurrency.
- Re-enqueued all publishable campaign, approval, generation, retry, and admin paths.
- Preserved successful platform results during partial retries to prevent duplicate posts on destinations that already succeeded.
- Added strict production destination handling: only real `connected` accounts publish; no synthetic success is generated.
- Added an approval check in both controllers and the publishing service.
- Added provider request cancellation through a shared five-minute timeout, configurable with `SOCIAL_PROVIDER_TIMEOUT_MS`.
- Added graceful queue/Redis shutdown for web and publishing-worker processes.
- Added live content-library/calendar status polling for immediate publish transitions.
- Added schedule time to the existing quick-create UI without replacing its design.

## Operational defaults

```env
ENABLE_SCHEDULED_PUBLISHING=true
APP_TIME_ZONE=Africa/Kampala
DUE_POST_POLL_MS=10000
DUE_POST_CONCURRENCY=3
POST_PUBLISH_CONCURRENCY=3
SOCIAL_PROVIDER_TIMEOUT_MS=300000
PUBLISHING_STALE_MS=900000
REDIS_PING_TIMEOUT_MS=5000
RUN_AI_GENERATION_WORKER_IN_WEB=true
```

Redis is an accelerator, not a single point of correctness. The web process publishes due records through MongoDB even when Redis is unavailable. For higher throughput, run:

```bash
npm run worker
```

For a larger deployment using a dedicated AI worker, run `npm run worker:ai` and set `RUN_AI_GENERATION_WORKER_IN_WEB=false` on web instances.

## External requirements

The code cannot publish to a provider without valid real infrastructure. Each enabled platform still requires its production OAuth application, exact HTTPS callback URL, approved scopes/features, non-expired encrypted token, selected connected destination, publicly reachable media where required, and provider-specific account eligibility. Missing prerequisites now produce a persistent failed status, reconnect state, detailed error, and notification rather than a false success.

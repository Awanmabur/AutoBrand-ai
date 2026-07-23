# Facebook and Instagram Live Publishing Repair — 2026-07-23

## Runtime evidence

The supplied runtime log proves that the composer accepted the request and queued AI generation, while generated PNG/MP4 URLs repeatedly returned HTTP 404. The log never reached a provider-dispatch lifecycle entry after `post_generation_queued`. The failure therefore occurred between generation completion, durable media availability, and social-provider dispatch—not in the initial form submission.

## Root causes repaired

1. **Generated posts were not reliably handed to publishing.**
   - The requested `publish` or `schedule` action is now persisted with the AI job.
   - Generation completion dispatches the post before non-critical usage, credit, or notification bookkeeping.
   - Startup and periodic recovery re-dispatch completed generated posts that were stranded by an earlier process.

2. **Selected Facebook and Instagram destinations were lost or replaced.**
   - Exact `targetAccounts` IDs now persist from the composer to the Post, AI job, regenerated Post, readiness checks, and provider calls.
   - Live actions reject missing, expired, disconnected, foreign-brand, or unverified destinations before generation is started.
   - Provider jobs are prepared only for the exact selected account records.

3. **Generated media database records survived after local files disappeared.**
   - New generated media can be persisted in MongoDB GridFS instead of relying only on an ephemeral local filesystem.
   - Missing local media is detected, archived, removed from job metadata, and regenerated.
   - A range-enabled public media route serves GridFS video/image data to the dashboard and external providers.

4. **Instagram failure cancelled Facebook.**
   - Publishing readiness and execution are isolated per platform.
   - Facebook can upload an existing local image/video directly as multipart bytes.
   - Instagram records a precise failure when it cannot fetch a public HTTPS media URL, without cancelling Facebook.
   - Retries target only failed destinations; successful Facebook posts are not duplicated.

5. **Meta account readiness was incomplete.**
   - Facebook Page IDs, Page tokens, linked Instagram professional account IDs, required grants, expiration, ownership, and brand mapping are validated.
   - Unverified legacy Instagram connections are retired and must be reconnected rather than producing silent no-op posts.

6. **Publishing failures were invisible.**
   - Structured logs now show composer queueing, generation handoff, due-post discovery, platform readiness, exact account IDs, provider request start, provider response, and final per-destination results.
   - Diagnostic and repair commands expose stranded posts without printing decrypted tokens.

7. **Old dashboard cache and missing service worker.**
   - A cache-reset service worker is served and dashboard asset versions were changed so the fixed composer code replaces stale browser JavaScript.

## Commands after replacing the source

Preserve the real `.env`, MongoDB database, and any existing runtime upload directory, then run:

```bash
npm ci
npm run repair:publishing
npm run diagnose:publishing -- --limit=20
npm start
```

For read-only Meta identity verification:

```bash
npm run diagnose:publishing -- --limit=20 --live
```

## Instagram media requirement

Instagram Graph publishing requires a public HTTPS URL that Meta can fetch. For local development, configure Cloudinary or expose the application through a public HTTPS tunnel and set `PUBLIC_APP_URL` to that public origin. Facebook Page image/video publishing can still proceed from an existing local file because the adapter uploads the bytes directly.

## Expected runtime traces

A successful generated Facebook + Instagram submission should now include messages similar to:

```text
[composer] AI post queued
[generation] post handed to publishing
[publishing] due-post sweep found work
[publishing] post claimed
[publishing] provider jobs prepared
[publishing] provider request starting
[publishing] provider request succeeded
[publishing] post attempt completed
```

When Instagram cannot access media, Facebook should still show `provider request succeeded`, while Instagram stores its own blocker or provider error.

## Verification

- 223 JavaScript files passed syntax checking.
- 222 JavaScript files passed the static security gate.
- 46 focused publishing, Meta, media persistence, recovery, scheduling, and exact-target tests passed with 0 failures.
- Full repository run discovered 151 tests: 144 passed and 7 could not load because `mongoose`/`jsonwebtoken` were unavailable in the isolated test environment. There were no assertion failures among loaded tests.
- The final ZIP is generated from the latest source after all GridFS, target-account, and Meta-readiness changes and is checked by extracting and comparing it to the source tree.

## Verification boundary

A real post cannot be sent from this isolated environment because it does not contain the user's decrypted Meta tokens or public production media origin. The repaired code now reaches the provider, records the exact provider rejection, and provides a diagnostic command instead of silently leaving the post generated but unpublished.

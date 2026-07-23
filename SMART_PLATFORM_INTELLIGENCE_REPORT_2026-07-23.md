# AutoBrand Smart Platform Intelligence Report

**Build:** v6  
**Date:** 2026-07-23  
**Scope:** Post creation, campaigns, Growth Studio, scheduling, handoff/auto-posting, social-account lifecycle, post editing, calendar recommendations, and dashboard destination visibility.

## Problem corrected

The dashboard previously used the same SocialAccount collection for two different purposes:

1. Social-account management, where disconnected and reconnect-required records must remain visible.
2. Publishing composition, where only healthy, decryptable, permission-ready, non-expired destinations should be selectable.

Because these concerns were mixed, removed, disconnected, expired, mock, and reconnect-required accounts could continue appearing in post and campaign forms or remain attached to scheduled content.

## Shared destination intelligence

A central destination service now resolves the publishing source of truth across the platform. A destination is publishable only when it:

- belongs to the current user and selected brand;
- is a real provider account rather than a mock/development record;
- has status `connected`;
- has an account ID and encrypted access token;
- has a non-expired token;
- passes provider permission and capability health checks;
- has a decryptable token under the current or previous encryption key;
- has a verified Instagram publishing grant when the platform is Instagram.

Management pages still show disconnected records so they can be reconnected or permanently removed. Compose pages receive a separate, filtered live-destination catalogue.

## Post creation and editing

- Quick Create, Full Composer and Calendar scheduling show only live destinations for the selected brand.
- Selecting a brand immediately hides unrelated platforms and accounts.
- Selecting a platform automatically selects an exact healthy destination for that platform.
- Hidden or invalid account inputs are disabled and cannot be submitted accidentally.
- Server-side post creation resolves the account IDs again; browser input is never trusted as the final authority.
- Publish and Schedule actions are unavailable when no live exact destination exists.
- Post edit dialogs list only currently live platforms.
- Generated posts preserve exact destination IDs through background AI generation and publishing.

## Campaigns and Growth Studio

- Campaigns store exact `targetAccounts`, not only platform names.
- Campaign creation validates selected brands, platforms, account ownership, permissions, token health and expiry.
- Draft creation assigns only the account IDs belonging to each idea's platform.
- Campaign scheduling revalidates destinations and updates legacy campaigns to current exact accounts.
- Removed platforms are filtered from campaign plans before scheduling.
- Growth Studio draft batches and campaign briefs use the same exact destination resolver.
- Video storyboards use a valid selected live platform rather than a static fallback.

## Social-account lifecycle

Disconnecting, health-failing, or permanently removing an account now triggers reconciliation:

- the account is removed from existing post target lists;
- stale platform variations are removed;
- scheduled or publishing posts with no remaining destination become `failed` and their schedule is cleared;
- posts with other valid destinations retain only those destinations;
- campaigns remove stale account IDs and unsupported plan items;
- active campaigns with no remaining destination are paused;
- permanent removal deletes the SocialAccount record after reconciliation.

This prevents disconnected channels from silently returning in forms or being retried by scheduled jobs.

## Calendar and dashboard intelligence

- Best-time recommendations are generated only for platforms currently connected to each brand.
- Brand Brain preferred platforms are used only when they are live.
- The dashboard's connected destination metrics count only publishable accounts.
- Social management distinguishes all managed records from currently connected records.
- The dashboard JavaScript asset version was changed so stale browser/service-worker content is not reused.

## Verification

- Focused smart-destination tests: **6 passed, 0 failed**.
- Full test discovery: **165 tests**.
- Full test results: **158 passed**.
- Seven suites could not load because `mongoose` or `jsonwebtoken` was not installed in the execution environment. These were dependency-load failures, not assertion failures.
- JavaScript syntax: **226 files passed**.
- Static security inspection: **225 files passed**.
- One existing static notice remains for the development-only local Pesapal URL.

## Deployment

Preserve the production `.env`, database, encryption key and uploads. Replace the old source with v6, then run:

```bash
npm ci
npm run repair:publishing
npm run dev
```

After deployment, hard-refresh the dashboard once. The new asset version and cache-reset service worker will prevent older compose JavaScript from remaining active.

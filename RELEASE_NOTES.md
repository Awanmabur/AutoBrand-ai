# AutoBrand AI v1.0.5 Production Hotfix

Date: 2026-09-08

## MongoDB legacy-index compatibility fix

v1.0.5 fixes startup failure on databases created by an older AutoBrand build where the Payment collection already contains a non-unique MongoDB index named `provider_1_reference_1`, while the hardened billing model now requires `provider + reference` to be unique.

The index lifecycle is now deterministic:

- Mongoose `autoIndex` is disabled in every environment; the centralized index manager is the sole startup index owner.
- Payment's integrity index has a stable explicit name: `uniq_payment_provider_reference`.
- Startup detects the old non-unique `provider + reference` index.
- Before replacing it, AutoBrand aggregates the Payment collection and proves there are no duplicate provider/reference groups.
- Clean legacy databases are upgraded automatically before the HTTP server accepts traffic.
- Duplicate financial references fail closed with `EPAYMENTREFERENCEDUPLICATES`; no Payment record is deleted or merged automatically.
- `npm run migrate:production` reports `paymentReferenceUniqueness` before any apply-mode database mutation.
- `npm run migrate:production:apply` refuses to mutate the database when duplicate payment references require finance review.
- The migration continues to create/verify all declared indexes only after data-integrity repair steps.


## v1.0.5 verification

- JavaScript syntax: PASS — 244 files.
- Automated tests: 258 total — 257 passed, 0 failed, 1 skipped because the recovered dependency tree contains Windows Sharp native binaries while this verification host is Linux.
- Static security gate: PASS.
- Source production preflight: PASS.
- Release secret/mock scan: PASS.
- Production dependency audit (`--omit=dev --offline`): 0 known vulnerabilities.
- Dependency versions are unchanged from v1.0.4; this release changes application/index-migration code only.

## Verification added

Three permanent regression cases now cover:

1. clean legacy non-unique index → safe unique-index upgrade;
2. duplicate financial references → fail closed and preserve the existing index/data;
3. already-current unique index → no destructive operation.

The complete v1.0.4 production-hardening, Manual Publisher, workspace RBAC, Pesapal reconciliation, analytics, onboarding/billing clarity, security controls, migrations, and documentation remain cumulative in this release.

---

## Previous cumulative v1.0.4 release baseline

Date: 2026-09-08

## Release focus

This release converts the recovered project from a partially connected SaaS into a workspace-oriented production architecture with hardened Pesapal entitlements, secure OAuth account linking, shared-brand RBAC, a US$10 / 1-month zero-AI Manual Publisher product, truthful provider analytics, durable workers, real account-deletion processing, production migrations, and release/preflight controls.

## Security/high-impact corrections

- Unpaid Pesapal checkout no longer grants a paid plan.
- Pesapal completion/reversal is reconciled server-to-server with integrity checks and idempotent activation.
- Stale completion cannot resurrect a terminal reversal.
- Google login cannot auto-link/take over a password account solely because the email matches.
- Explicit Google linking is authenticated and purpose-bound.
- Social credential/business ownership follows the brand workspace, while actors remain separately auditable.
- Background jobs recheck current permissions and preserve actor/billing-workspace metadata.
- Development token-encryption keys default outside the repository.
- Generic webhooks cannot set Pesapal payment state.
- Production mock success paths for videos/social publishing/analytics were removed or isolated as development legacy.

## Plan, onboarding and money clarity

Pricing, signup, Google onboarding, checkout and dashboard billing now use one plan vocabulary. Free Trial is US$0 for 7 days. Manual Publisher and AI Starter are both US$10 for one month but are explained as different workflows. Paid access uses manual Pesapal payment per access period; AutoBrand does not automatically charge the next period. Paid and trial onboarding converge on the same workspace setup journey after entitlement activation. Usage quotas follow the actual subscription access period rather than the calendar month.

## Manual Publisher

Added the US$10 / 1-month Manual Publisher plan with zero AI credits/generations. Users can bring exact copy and media, schedule/publish across connected destinations, use bulk CSV import, approvals, calendar, analytics, recovery, deterministic validation, and local Sharp/FFmpeg template-video rendering at 0 AI credits.

## Analytics

Added leased provider analytics synchronization with real provider data, unsupported/awaiting states, per-metric availability, asynchronous TikTok publication reconciliation, CSV truthfulness, and automatic shared Brand Brain performance-memory refresh.

## Data/operations

Added dry-run/apply production migration, account deletion grace/cancellation/processor lifecycle, source/runtime preflight checks, static security/release gates, deployment/incident documentation, and a dedicated analytics worker process definition.

## Verification on recovered source

- Syntax gate: pass.
- Static security gate: pass, no notices.
- Offline production dependency audit: 0 known vulnerabilities.
- Automated tests: 255 total; 254 passed; 0 failed; 1 skipped because the recovered local `node_modules` contains Windows Sharp optional binaries while the current verification host is Linux.
- `package-lock.json` contains Linux Sharp optional dependencies. A production deployment must run a fresh `npm ci --include=optional`, then `NODE_ENV=production npm run preflight:runtime`; this fails closed if Sharp or FFmpeg cannot load.

The release archive deliberately excludes `node_modules`, local uploads/generated files, `.env`, token-encryption keys, logs, caches, nested archives, and other runtime artifacts.


- Distributed rate limiting now uses Redis when available and MongoDB as a shared fallback; production fails closed instead of degrading to per-process counters.
- Production startup explicitly creates all schema-declared database indexes despite `autoIndex=false`, preserving unique/idempotency and TTL guarantees on fresh deployments.

- Added durable Pesapal reconciliation with MongoDB leases, backoff, missed-notification recovery, and decreasing-cadence reversal monitoring for paid transactions.
- Production now requires live Pesapal configuration; billing callbacks use `APP_URL` rather than a potentially separate media `PUBLIC_APP_URL`.

- Social destinations now have a database uniqueness boundary on `brand + platform + accountId`; production migration identifies normalized collisions, re-points dependent Posts/Campaigns/analytics jobs, merges duplicates, normalizes the surviving identifiers, and only then creates indexes.
- Legacy `mock` social connections no longer consume paid social-account quota.
- Pesapal `REVERSED` is persisted separately from `refunded`; both revoke entitlement, remain terminal, and are surfaced distinctly in billing/audit UX.

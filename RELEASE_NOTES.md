# AutoBrand AI v1.6.4 — Publishing Readiness Consistency

## v1.6.4 — Account readiness hardening

- Background publishing now reuses the same destination-readiness rules as the composer, MCP and channel workspaces. A saved account whose token is expired, whose status requires reconnect, whose required permissions are missing, or whose encrypted credential cannot be read is blocked before any provider publish call.
- `diagnose:publishing` now separates content/media readiness from social-account readiness and reports an effective readiness result. This removes misleading cases where valid media/copy appeared `ready: true` while the selected provider account was expired or reconnect-required.
- Diagnostic account output now includes `effectiveStatus`, `readyToPublish` and `readinessBlockers`.
- Historical missing local-disk media remains preserved as history; active publish attempts continue to fail safely until the media is regenerated or uploaded to durable storage.
- Added regression coverage for stale `connected` rows with expired tokens and for background-publisher destination checks.

Verification: 308 tests, 307 pass, 0 fail, 1 expected Sharp-native skip on the verification dependency set; static security and release scans pass.

---

# AutoBrand AI v1.6.4 — Consolidated Production Release

- Consolidates the v1.6.2 production tree, Render dashboard `videoTemplates` 500 fix, and Facebook media test-isolation fix.
- Replaces Nodemon with Node 24 native `--watch` development mode.
- Pins the production dependency floor verified clean by the live npm audit: Express 4.22.3, EJS 6.0.1, Morgan 1.12.1, Nodemailer 10.0.14, Sharp 0.35.5, body-parser 1.20.8, and qs 6.16.0 override.
- Keeps the production build audit as a release blocker.

# v1.6.4 — Dashboard Runtime Hotfix & Verification Hardening

- Fixed the production dashboard-wide `ReferenceError: videoTemplates is not defined` by serializing video-template options in the shared dashboard controller and reading them defensively in the EJS shell.
- Added a regression test covering the shared-dashboard video-template contract.
- Included v1.6.1 production-test isolation fixes for Pesapal, email runtime, callback origins, and Windows static-security path handling.
- Keeps the v1.6.0 production hardening, SEO/AI discovery, privileged MFA, signed-media, billing and social-operating-system work intact.

# v1.6.0 — Final Production Hardening, Discovery & Privileged MFA

Date: 2026-10-04

## End-to-end hardening

- Added signed HMAC GridFS media URLs and a production migration that rewrites legacy unsigned references across Media, BrandAsset, AI video jobs and rendered videos before unsigned production URLs are rejected.
- Remote/imported media is now fetched once through SSRF/content validation and ingested into the user's selected AutoBrand / Google Drive / both storage path instead of retaining arbitrary third-party URLs.
- Added privileged-account second-factor login using short-lived server-side email challenges with browser binding, attempt caps, replay prevention and audit events. Production configuration warns if privileged MFA is disabled and the production template enables it.
- Account deletion now also clears outstanding privileged MFA challenges, analytics-sync jobs and pseudonymizes matching public-inquiry identity fields while preserving accounting evidence according to lifecycle rules.
- Sensitive request logging keeps query strings out of access logs and support/error links use configured support contacts rather than placeholder addresses.
- Added the AI Brain worker to process declarations.

## SEO and AI discovery

- Added WebSite JSON-LD alongside Organization and SoftwareApplication markup; retained canonical, Open Graph, Twitter and sitemap coverage.
- Search crawlers and training controls are separated: public search/discovery can be enabled while training-specific user agents remain disallowed by default.
- Expanded robots rules for OpenAI search/ads and Apple search while protecting dashboard, auth, MCP, review, media and health paths.
- Added `docs/SEO-AI-DISCOVERY.md` and `docs/FINAL-PRODUCTION-AUDIT.md`.

## Verification

- Full regression suite: **305 tests / 304 passed / 0 failed / 1 expected Sharp-native skip** on the verification host.
- JavaScript syntax, static security, source preflight, release secret/mock scan and cached/offline production dependency audit pass.
- Production deployment must still run a fresh `npm ci --include=optional`, online `npm audit --omit=dev`, runtime preflight, real-provider E2E checks and backup/restore verification.

---

# v1.4.0 — Billing Contracts, Proration & Hard AI Token Budgets

Date: 2026-10-04

## Immutable commercial contracts

- Active subscriptions now persist a `planSnapshot` containing the purchased price/currency, included credits, limits, features and AI configuration.
- Runtime entitlement and credit calculations prefer the active subscription snapshot, so later Superadmin edits to the live plan catalogue affect future purchases without rewriting an existing paid period.
- Payments persist their own plan snapshot and plan-change quote for historical financial consistency.

## Fair plan changes

- Higher-price upgrades are quoted with unused-period proration from the customer's contracted current-plan price.
- The UI, Payment record, Pesapal submitted amount and server-to-server verification all use the same persisted amount-due quote.
- Lower-price downgrades and equal-price branch switches are scheduled for `currentPeriodEnd`, preventing mid-cycle allowance hopping.
- Scheduled changes can be cancelled. AutoBrand's current manual Pesapal model does not silently auto-charge a future period.
- A reversed/refunded upgrade can restore the still-valid previous subscription for the remainder of its original period.

## Hard AI token budgets

- `monthlyTokenLimit` is now enforced before provider execution rather than used only for reporting.
- Requests atomically reserve a conservative input upper bound plus capped output tokens, then reconcile provider-reported usage after completion.
- OpenAI/Anthropic/Gemini-compatible usage shapes are recorded when available; estimation is an explicit fallback.
- Reservations have unique ids and expire after 30 minutes so a crashed process cannot permanently strand allowance.
- Legacy and modern text-generation paths both use the same token-budget service.

## Migration and verification

- Production migration backfills commercial snapshots, token counters and reservation arrays for legacy subscriptions, plus best-effort historical Payment snapshots.
- Full regression: 290 tests, 289 passed, 0 failed, 1 expected Sharp-native skip in the verification dependency tree.
- JavaScript syntax, static security, production source preflight and release secret/mock scans pass.
- Cached/offline production dependency audit reports 0 known vulnerabilities; deployment must still run a fresh online `npm audit --omit=dev`.

---

# v1.3.1 — Plan Alignment, AI Brain Modes & Storage Consistency

Date: 2026-10-04

## Plan alignment

- Audited the complete default entitlement matrix rather than relying on page visibility alone.
- Fixed higher-tier inheritance so Pro, Business and Agency retain Campaigns, Growth Studio, content repurposing, automation, approvals, templates and the appropriate scoring/analysis capabilities inherited from lower AI tiers.
- Added a monotonic plan regression test covering boolean features, feature levels, limits and included AI credits across `AI Starter → Growth → Pro → Business → Agency`.
- Kept Publish as a separate US$10 bring-your-own-AI branch with zero AutoBrand AI generation allowances.
- Made ChatGPT, Google Drive and channel workspace entitlements explicit per built-in plan. They remain core integrations but never bypass underlying plan gates or quotas.
- Fixed pricing/comparison rendering so undefined custom-plan integration flags are no longer incorrectly shown as Included.

## AI Brain operating modes

- Closed an entitlement gap where AI Starter could configure unattended AutoBrand AI in Background Approval mode despite not having automation access.
- Both unattended **Background Approval** and **Autopilot** now require the Growth+ `autoModeAccess` entitlement.
- AI Starter retains user-driven built-in AI assistance; Publish retains manual/ChatGPT operation without AutoBrand generative-AI cost.
- Updated Brand Brain create/edit controls to visibly disable Background Approval/Autopilot on ineligible plans and disable AutoBrand AI/Hybrid sources when no built-in AI allowance exists.

## Storage and operator consistency

- Dashboard/manual uploads and ChatGPT/MCP uploads honor the same saved `platform`, `google_drive`, or `both` storage preference.
- Google Drive remains per-user OAuth storage using `drive.file`; no user asset is silently stored in a Superadmin/platform Drive.
- Drive-only uploads keep the durable file in the user's Drive while AutoBrand retains only the authorized metadata/proxy required for publishing.
- ChatGPT Operator continues to inherit normal AutoBrand RBAC, brand ownership, plan limits, AI quotas, provider readiness and audit logging.

## Channel workspaces

- Per-network workspaces remain a core capability across current plans.
- Basic Analytics shows account health, publishing history and core metrics.
- Standard Analytics and above add channel recommendations and top-performance comparisons.
- Workspace entitlements now resolve from accessible brand-owner plans rather than assuming the viewer's personal subscription for all team contexts.

## Verification

- Full automated suite: **284 tests / 283 passed / 0 failed / 1 expected skip** on the verification host.
- The skipped test is the native Sharp image-resize test when the platform-specific optional dependency is unavailable locally.

---

# v1.3.0 — Social Operating System, ChatGPT Operator & Google Drive

AutoBrand AI v1.3.0 turns the platform from a feature-heavy scheduler into a simpler social operating system organized around **Create → Store → Approve → Schedule/Publish → Measure → Improve**.

## Product experience

- Reorganized dashboard navigation around the customer's workflow rather than internal feature names.
- Added dedicated workspaces for Facebook, Instagram, LinkedIn, TikTok, YouTube, X, Threads, Pinterest and Google Business Profile. Each workspace shows connected-account health, recent posts, provider publishing outcomes, 30-day performance and actionable recommendations.
- Added explicit Superadmin mode. Superadmins keep the existing backend bypasses for plan gates, quantitative limits and AutoBrand AI credits, and the dashboard now communicates that clearly instead of showing upgrade prompts.
- Added an AI-operator overview so users can see ChatGPT/MCP authorization and Google Drive readiness from the main workspace.

## Google Drive assets

- Added per-user Google Drive OAuth using the narrow `drive.file` scope.
- Added AutoBrand / Google Drive / Both storage preference.
- Existing AutoBrand media can be backed up to Drive from the media library.
- ChatGPT uploads can choose the same storage destination.
- Drive-only assets remain owned by the user in Google Drive; AutoBrand keeps only the metadata/proxy needed for authorized publishing. Disconnecting or deleting AutoBrand revokes AutoBrand's OAuth access but deliberately does not delete the user's Drive files.
- Account deletion now attempts provider token revocation before removing the Drive connection record.

## ChatGPT / MCP operator

The production MCP connector now includes storage/media controls in addition to the v1.2 content and publishing tools:

- `get_storage_status`
- `list_media`
- `sync_media_to_drive`
- enhanced `upload_media` with `platform`, `google_drive`, or `both` destination

Together with brand/account discovery, drafts, editing, immediate publishing, scheduling, cancellation, status and analytics, a connected ChatGPT can now create or receive creative assets, persist them through AutoBrand/Drive, and manage the publishing workflow without bypassing AutoBrand RBAC, plan rules, provider readiness or audit logging.

## Plans and affordability

- The existing `manual-publisher` database slug remains for compatibility, but its public product name is now **Publish**.
- Publish remains **US$10 for 1 month** and includes ChatGPT/Codex connector access, Google Drive, publishing/scheduling, approvals, recovery and per-channel analytics.
- Publish includes zero AutoBrand generative-AI credits. This makes it a strong bring-your-own-AI tier: customers can use their connected ChatGPT/Codex or their own creative assets without forcing AutoBrand to charge for every generation.
- ChatGPT connector, Google Drive access and channel workspaces are enabled across the default plan family.

## Verification

- Full automated suite: **271 tests, 270 passed, 0 failed, 1 expected skip** on the verification host.
- Syntax checks, static security gate, production source preflight and release scan pass.
- The skipped native image-resize test requires Sharp's Linux optional native dependency and must be exercised after fresh production `npm ci --include=optional`.

---

# v1.2.0 — Production ChatGPT / MCP Connector Completion

Date: 2026-10-04

## Connector completion

- Completed the native AutoBrand remote MCP endpoint at `/mcp` while reusing the existing Brand, SocialAccount, Media, Post, scheduler, publishing-worker, analytics and RBAC architecture.
- Kept one publishing engine: MCP tools create/use normal AutoBrand resources and do not bypass provider readiness, plan/usage or workspace permission checks.
- Added durable ChatGPT file ingestion through AutoBrand media storage so image/video posts use AutoBrand media records instead of fragile third-party preview URLs.
- Completed tools for profile, brand/account discovery, media upload, draft creation/editing, direct publish, draft publish, scheduling, draft scheduling, post listing/status, scheduled-post listing/cancellation and analytics.
- Hardened tool JSON-schema validation, OpenAI-compatible output schemas/security metadata, profile metadata and destructive-action annotations.

## OAuth and security hardening

- Completed OAuth 2.1 authorization-code + PKCE S256 flow with resource/audience binding, issuer identification, protected-resource metadata, client discovery/registration support and short-lived MCP access tokens.
- Hardened ChatGPT CIMD validation and public-client token-auth method checks.
- Added atomic refresh-token rotation and refresh-token-family revocation on replay.
- Added access-token `jti` revocation records and active MCP grant checks on every authenticated MCP request.
- Added user-facing ChatGPT/MCP connection management in Dashboard Settings; revoking a client invalidates the grant and its active refresh tokens.
- Extended account deletion to remove MCP authorization codes, refresh tokens, grants and access-token revocation records.
- Invalid/expired bearer tokens now return a proper OAuth `401` challenge; missing tokens remain discoverable so clients can initiate authorization.

## Protocol and operations

- Maintained legacy MCP initialization compatibility while hardening modern 2026 protocol discovery/tool responses.
- Added source/deployment documentation, production checklist coverage and release-gate inclusion for the connector.
- Release packaging excludes `.env`, token encryption keys, private keys, runtime uploads/generated media, logs/caches, nested archives and `node_modules`.

## Verification

- JavaScript syntax gate: PASS.
- Automated tests: 265 total / 264 passed / 0 failed / 1 skipped (local Sharp native optional dependency unavailable on this verification host).
- Static security gate: PASS.
- Source production preflight: PASS.
- Release secret/mock scan: PASS.
- Cached offline production dependency audit (`npm audit --omit=dev --offline`): 0 known vulnerabilities. The fresh online npm advisory request could not reach `registry.npmjs.org` (`EAI_AGAIN`), so CI/deployment should still rerun `npm audit --omit=dev` with network access before release approval.

---

# v1.1.0 — Native AutoBrand MCP Connector

- Added OAuth-protected ChatGPT/Codex MCP endpoint at `/mcp`.
- Added ChatGPT file ingestion into durable AutoBrand media storage.
- Added MCP tools for brand/account discovery, drafts, publishing, scheduling, cancellation, post status and analytics.
- Reused existing AutoBrand RBAC, usage limits, provider readiness checks and durable publishing pipeline.
- Completed MCP OAuth discovery, PKCE, CIMD/DCR support and RFC 9207 issuer identification.
- Added production environment validation and connector documentation/tests.

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

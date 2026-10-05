# Production Checklist

## Code/release

- [ ] `npm run lint` passes.
- [ ] `npm test` has zero failures.
- [ ] Native Sharp/FFmpeg tests run on the actual Linux deployment environment.
- [ ] `npm run security:static` passes with no unresolved notices.
- [ ] `npm audit --omit=dev` reports no unacceptable vulnerabilities.
- [ ] `npm run release:scan` passes.
- [ ] Source archive contains no `.env`, encryption key, credentials, uploads, logs, caches, nested archives or `node_modules`.

## Environment

- [ ] Node 24.x.
- [ ] Fresh `npm ci --include=optional` completed.
- [ ] `NODE_ENV=production npm run preflight:runtime` passes.
- [ ] APP/PUBLIC URL is public HTTPS.
- [ ] MongoDB uses production remote credentials/TLS as appropriate.
- [ ] Startup reports declared database indexes verified; no `EDATABASEINDEXES` error remains.
- [ ] `npm run migrate:production` reports `paymentReferenceUniqueness.duplicateGroups = 0` before applying an upgrade from older databases.
- [ ] Payment collection has the unique index `uniq_payment_provider_reference`; the legacy non-unique `provider_1_reference_1` index is absent.
- [ ] Multi-instance rate limiting uses Redis or MongoDB shared counters; no production process-memory fallback.
- [ ] Security secrets are distinct and >=32 strong random characters.
- [ ] Development email links/fallbacks are disabled.
- [ ] `SUPERADMIN_EMAIL` is explicit; no default admin identity/password is used.
- [ ] `SUPERADMIN_ALLOW_PROMOTION` is false unless a specific existing account is intentionally being promoted.

## Billing

- [ ] Pesapal API 3 production credentials installed.
- [ ] IPN URL registered and public HTTPS.
- [ ] Callback and cancellation URLs are correct.
- [ ] Test payment reconciles through `GetTransactionStatus`.
- [ ] Unpaid checkout cannot unlock a plan.
- [ ] Pesapal reversal test persists `reversed`, revokes entitlement, and cannot be resurrected by stale `COMPLETED`.
- [ ] Refund and reversal states remain distinct in finance/audit views.
- [ ] Payment reconciliation worker mode matches the deployed process layout.
- [ ] A missed callback/IPN test is recovered by periodic reconciliation.
- [ ] No production payment requiring automatic recovery is left `reconciliationStatus=exhausted` without finance review.

## Plans, onboarding and money

- [ ] Public pricing, signup, checkout, dashboard billing and admin Plan Management all use `US$` for USD amounts.
- [ ] Free Trial is shown as `US$0 · 7 days`, requires no Pesapal payment and does not automatically convert to paid.
- [ ] Publish and AI Starter are both clearly shown as `US$10 · 1 month of access`; Publish has zero included AutoBrand generative-AI credits but includes ChatGPT/Codex connector, Google Drive, scheduling and analytics, while AI Starter includes AutoBrand generative AI.
- [ ] No customer-facing surface promises automatic renewal or automatic charging; the current Pesapal flow requires a new verified payment for the next access period.
- [ ] New Free Trial signup lands in the welcome/workspace setup flow without visiting checkout.
- [ ] New paid signup lands on the exact selected-plan review/Pesapal checkout and enters the same welcome/workspace setup flow only after verified payment.
- [ ] Google signup follows the same Free Trial vs paid onboarding rules as password signup.
- [ ] Monthly/yearly usage limits follow the subscription `currentPeriodStart` → `currentPeriodEnd`, not the first/last day of a calendar month.
- [ ] Dashboard usage shows the exact access-period date range and next-payment policy.
- [ ] Plan switching explains whether access is immediate and never grants a paid entitlement before Pesapal verification.

## Workspace/product

- [ ] Owner and invited member can work on the same brand according to RBAC.
- [ ] Removed member cannot publish through a stale queued job.
- [ ] Publish performs draft/schedule/publish without any implicit AutoBrand AI call/credit use; a connected ChatGPT/Codex account is treated as bring-your-own AI.
- [ ] Bulk CSV import validates whole batch before insertion.
- [ ] Local template video produces a real MP4 at 0 AI credits.
- [ ] Archive/restore works.

## Providers/analytics

- [ ] Every enabled social account is real connected/reconnect-ready; no mock account remains or consumes plan quota.
- [ ] `brand + platform + accountId` destination uniqueness index exists after migration and no duplicate destination group remains.
- [ ] Controlled test post publishes to each enabled provider.
- [ ] Analytics sync writes real provider metrics or explicit unavailable state.
- [ ] No fake/mock analytics/video artifact remains after migration.

## Operations

- [ ] Database backup completed before migration.
- [ ] Production migration dry-run reviewed.
- [ ] Production migration applied and re-run cleanly.
- [ ] `/readyz` returns 200.
- [ ] AI/analytics worker mode matches actual deployed processes.
- [ ] Monitoring alerts exist for failures/backlogs/payment discrepancies.
- [ ] Account deletion scheduling and cancellation tested.

## Google Drive

- [ ] Google OAuth client has the exact production callback URL `/dashboard/settings/google-drive/callback`.
- [ ] Requested scope is the narrow `drive.file` scope plus identity scopes; full-Drive access is not requested.
- [ ] Connect, refresh, reconnect and disconnect flows work for a controlled account.
- [ ] AutoBrand / Google Drive / Both storage preference is tested.
- [ ] Existing media can be backed up to Drive and ChatGPT `upload_media` can target Drive/Both.
- [ ] Disconnect/account deletion revokes AutoBrand access but does not delete user-owned Drive files.

## ChatGPT / MCP connector

- [ ] `MCP_ENABLED=true` only after the AutoBrand deployment is public HTTPS.
- [ ] `MCP_OAUTH_ISSUER` is the canonical public AutoBrand origin.
- [ ] `MCP_RESOURCE_URL` is the canonical HTTPS `/mcp` URL.
- [ ] `MCP_OAUTH_TOKEN_SECRET` is unique, random, >=32 characters and not reused by any web/session/provider secret.
- [ ] `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` return the expected resource and scopes.
- [ ] `/.well-known/oauth-authorization-server` advertises PKCE S256, issuer identification, DCR and CIMD support.
- [ ] MCP Inspector connects successfully in both handshake mode and 2026 modern discovery mode.
- [ ] ChatGPT Developer Mode can add the production `/mcp` URL and complete AutoBrand login/consent.
- [ ] `get_profile` identifies the correct AutoBrand account and exposes no unrelated sensitive data.
- [ ] Tool scan shows `outputSchema`, OAuth `securitySchemes`, `_meta.securitySchemes`, profile metadata and file metadata.
- [ ] A generated/uploaded image can pass through `upload_media` to AutoBrand, Google Drive or both and becomes a durable AutoBrand `Media` record.
- [ ] A test draft can be created/edited without publishing.
- [ ] Immediate publish is tested only against test social accounts before production brands.
- [ ] Scheduled publish can be cancelled before provider dispatch.
- [ ] Provider delivery IDs/errors are visible through `get_post` without exposing provider tokens.
- [ ] Refresh-token rotation/replay protection has been tested.
- [ ] Revoking a ChatGPT/MCP connection in Settings immediately prevents further MCP access.
- [ ] Account deletion removes the user's MCP codes, refresh tokens, grants and revocation records.

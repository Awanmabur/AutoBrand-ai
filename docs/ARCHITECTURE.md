# Architecture

## Purpose

AutoBrand AI is a multi-tenant social publishing SaaS. A user may own brands or participate in another brand as a team member. The platform supports manual content, AI-assisted content, media management, approvals, campaigns, scheduling, provider publishing, real analytics, subscription billing through Pesapal, and background processing.

## Core boundaries

```text
Browser / client
      |
Authentication + CSRF + rate limits
      |
Workspace authorization (Brand + TeamMember)
      |
Feature entitlement + workspace quota
      |
Domain controller/service
      |
MongoDB durable state
      |
Background worker / provider adapter
      |
Social / AI / payment provider
```

The browser is never trusted to grant a plan, permission, payment state, provider status, storage ownership, or quota allowance.

## Tenancy model

`Brand` is the business workspace boundary. `Brand.owner` is the commercial owner and billing owner. `TeamMember` grants other users roles and permissions against that brand. Business resources carry `brand`; actor attribution is stored separately using fields such as `createdBy`, `uploadedBy`, or `actor`.

Never use `createdBy` as a tenancy filter. It answers “who did this?”, not “who owns this?”.

## Major data domains

- Identity: `User`, refresh/session tokens, verification/reset/linking state.
- Workspace: `Brand`, `TeamMember`.
- Content: `Post`, `Campaign`, `Approval`, `ClientApprovalLink`.
- Media/video: `Media`, `VideoTemplate`, `VideoRender`, `AiVideoJob`, `AvatarProfile`, `AvatarConsent`.
- Distribution: `SocialAccount`, provider result metadata, publishing retry state.
- Analytics: `Analytics`, `AnalyticsSyncJob`.
- Billing: `SubscriptionPlan`, `Subscription`, `Payment`, `CreditLedger`, `UsageLog`.
- Operations: API/audit logs, notifications, worker state, distributed rate-limit buckets, payment reconciliation state and deletion requests.
- External asset storage: `CloudStorageConnection` plus Drive metadata on `Media`; AutoBrand never treats user-owned Google Drive as platform-owned storage.

## Actor vs owner vs subject

The architecture deliberately separates these identities:

- **Actor** — authenticated person performing the action.
- **Workspace owner** — brand owner whose subscription, credentials and quotas apply.
- **Business asset owner** — normally the brand/workspace.
- **Likeness subject/consenter** — person whose avatar/likeness rights are being attested.

For example, an invited creator may create an avatar profile for a shared brand. `AvatarProfile.owner` is the workspace owner, `AvatarProfile.createdBy` is the creator, and `AvatarConsent.user` records who made the consent attestation.

## Synchronous vs asynchronous work

Synchronous HTTP requests perform validation, authorization, durable state transitions and fast provider initiation. Slow/retryable work belongs in workers. MongoDB leases provide durable coordination even when Redis is absent. Redis/BullMQ is an acceleration path, not the only durability boundary. HTTP rate limiting follows the same principle: Redis is the fast shared store when available, MongoDB is the distributed fallback, and production never degrades to process-local counters.

## Production invariants

1. Paid entitlement requires server-verified Pesapal completion.
2. A callback/IPN is a notification, not payment proof.
3. Workspace permissions are checked server-side on every protected action.
4. Team content is brand-scoped, never creator-scoped.
5. The Publish pipeline never silently invokes AutoBrand-billed generative AI; users may explicitly operate through their own connected ChatGPT/Codex account.
6. Failed providers remain failed; no mock output becomes publishable production content.
7. Missing analytics remains unavailable/awaiting sync; no fabricated metrics.
8. Social credentials are encrypted at rest and belong to the workspace owner.
9. Background recovery rechecks current authorization before executing delayed actions.
10. Release archives contain no secrets, local uploads, logs, caches or `node_modules`.
11. Production startup verifies all declared database indexes even though automatic index creation is disabled.
12. Pesapal callback/IPN is accelerated by durable periodic reconciliation; missed notifications cannot be the sole cause of permanently stale payment state.
## ChatGPT / MCP integration boundary

The MCP connector is an additional authenticated client boundary, not a separate publishing subsystem:

```text
ChatGPT / MCP client
      |
OAuth 2.1 + PKCE + resource/audience binding
      |
AutoBrand MCP tool adapter (/mcp)
      |
Existing AutoBrand RBAC / entitlements / media / post services
      |
MongoDB + scheduler + workers + provider adapters
      |
Connected social platforms
```

MCP tools create and mutate the same Brand, Media and Post resources used by the dashboard. The adapter never talks around workspace authorization and does not own social-provider tokens. Delayed publishing continues through the existing durable scheduling/worker path, including current permission/provider readiness rechecks.



## Customer operating loop

The dashboard and integration boundaries are organized around:

```text
Create → Store → Approve → Schedule/Publish → Measure → Improve
```

ChatGPT/Codex may act at each permitted step through MCP. Google Drive is an optional storage destination. Each social network has a dedicated workspace for provider health and performance, while all provider publishing still converges on the same durable Post/worker pipeline.

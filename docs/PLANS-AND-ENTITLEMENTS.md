# Plans and Entitlements

## Authority

`SubscriptionPlan` defines commercial capability. `Subscription` defines the active entitlement period. Controller logic reads plan capability through the subscription services rather than trusting `User.plan` or a browser field.

Valid paid capability comes from `active` or `trialing` subscription state according to product rules. Pending checkout attempts do not count.

## Plan dimensions

Plans contain:

- price/currency/access interval;
- included AI credits;
- explicit usage limits;
- feature flags/levels;
- allowed AI providers/models;
- queue priority and product presentation.

## Workspace behavior

When a team member works on Brand X, the plan and quotas of Brand X's owner apply. A user's personal plan does not override the selected workspace.

## Billing-period semantics

Monthly/yearly plans describe the length of one paid access period. The current Pesapal implementation does not automatically charge the next period. One verified payment activates one access period; the customer pays again through Pesapal to continue. Usage allowances follow `currentPeriodStart` → `currentPeriodEnd`, not the calendar month.

See `ONBOARDING-AND-BILLING.md` for the complete customer journey and money representation.

## Important plan

Publish is a distinct bring-your-own-AI/zero-AutoBrand-credit product capability, not an AI tier with merely hidden controls. It retains `manualPublisherAccess=true` and `smartComposerLevel=none`, zero AutoBrand AI quotas and zero included AutoBrand AI credits, while including ChatGPT/Codex connector access, Google Drive and channel workspaces.

## Quota enforcement

Quota checks occur server-side before expensive or scarce operations. Atomic counters/updates are used where concurrency could overspend an allowance. Usage logs preserve actor and workspace context.

## v1.3.1 operating-mode and entitlement matrix

AutoBrand has three customer operating paths. They deliberately share the same Brand, Media, Post, SocialAccount, scheduler, publishing workers and analytics records; only the source of creative work and degree of automation changes.

### 1. Manual / uploaded-assets workflow

The user supplies captions, images or video (or uploads them from their computer). AutoBrand then handles platform validation, media merging, approvals when enabled, scheduling/publishing, provider retry/recovery and analytics.

Storage follows the user's saved preference everywhere:

- `platform` — durable AutoBrand storage subject to the plan storage quota;
- `google_drive` — the final file is stored in that authenticated user's own Google Drive connection; AutoBrand retains only the metadata/proxy required for authorized publishing;
- `both` — AutoBrand keeps a publishing copy and also mirrors the asset into the user's own Drive.

A user's Google Drive connection is stored per AutoBrand user. It is never a shared Superadmin/platform Drive. Disconnecting or deleting AutoBrand revokes AutoBrand's authorization but does not delete user-owned Drive files.

### 2. ChatGPT Operator workflow

ChatGPT/Codex connects through the user's AutoBrand OAuth grant and MCP scopes. It can create or receive assets, upload them to the user's selected storage destination, create/edit drafts, schedule/publish, inspect account readiness and analytics, and configure Brand Brain settings.

The connector is an operator, not a plan bypass. Every MCP write re-enters normal AutoBrand RBAC, workspace ownership, plan features, usage limits, provider readiness and audit logging. A Publish-plan user therefore cannot consume AutoBrand AI generations through ChatGPT because that plan has zero AutoBrand AI allowances.

### 3. AutoBrand AI Brain workflow

`Assist` is user-driven. Built-in AutoBrand AI is available only where the plan has an AI composer level and non-zero AI generation limits.

Unattended Brain operation is a Growth+ capability:

- **Background Approval** — AutoBrand AI runs in the background, creates content and places it into approval/review.
- **Autopilot** — AutoBrand AI runs in the background and may schedule/publish when the Brand Brain rules, quality threshold and plan allow it.

Both unattended modes require `autoModeAccess=true`. This prevents AI Starter from becoming an unmetered/background automation tier simply by selecting Approval mode.

### Core integrations versus premium capabilities

ChatGPT/Codex, Google Drive and per-channel workspaces are intentionally core integrations across the current default plan family. They are encoded explicitly per built-in plan rather than granted through a blanket default. They do **not** unlock premium capabilities underneath them.

For example:

- a basic analytics plan can open a Facebook workspace and see account health, recent publishing history and core metrics;
- Standard Analytics adds recommendations and top-performance comparisons;
- higher tiers retain deeper analytics and higher quotas;
- a Publish user can ask ChatGPT to schedule an uploaded image but cannot ask AutoBrand to generate paid AI images;
- a Starter user can use built-in AI on demand but cannot enable background Brain automation;
- Growth and above can run Background Approval/Autopilot subject to AI/post quotas.

## Default plan matrix

| Plan | Price / access | Brands | Social accounts | ChatGPT + Drive | Built-in AutoBrand AI | Background AI Brain | Campaigns / Growth Studio | Approvals | Analytics | Main purpose |
|---|---:|---:|---:|---|---|---|---|---|---|---|
| Free Trial | US$0 / 7 days | 1 | 1 | Included | Limited text/image trial | No | No | Handoff only | Basic | Evaluate the real workflow |
| Publish | US$10 / month | 2 | 6 | Included | **None / 0 AutoBrand AI credits** | No | No | Included | Standard | Bring your own ChatGPT/assets; AutoBrand stores, schedules, publishes and measures |
| AI Starter | US$10 / month | 1 | 3 | Included | Text + image AI | No | No | Handoff | Basic | Solo user who wants built-in AI assistance |
| Growth | US$20 / month | 3 | 10 | Included | Higher AI + limited video | **Yes** | **Yes** | **Yes** | Standard | Growing team with campaigns and AI automation |
| Pro | US$50 / month | 10 | 30 | Included | Advanced AI + video/avatar allowances | **Yes** | **Yes** | **Yes** | Advanced | Serious multi-brand content operations |
| Business | US$100 / month | 30 | 100 | Included | Large AI allowances | **Yes** | **Yes** | Client workflows | Advanced | Larger organizations/teams |
| Agency | US$150 / month | 100 | 300 | Included | Highest public AI allowances | **Yes** | **Yes** | Client portals + agency controls | Advanced | Multi-client agencies / white label |
| Superadmin | Internal | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Platform administration |

### Upgrade monotonicity

The AI-plan family is monotonic: `AI Starter → Growth → Pro → Business → Agency`. Higher plans inherit all boolean capabilities of the lower AI plan and increase or preserve quantitative limits. Publish remains a separate bring-your-own-AI branch rather than a lower AI tier.

Superadmin bypasses page feature gates, numeric plan limits and AutoBrand credit limits for platform administration. No normal user role receives that bypass.


## v1.4 paid-period contract consistency

The live `SubscriptionPlan` remains the catalogue for new purchases, but an active `Subscription.planSnapshot` is the authority for that customer's current paid period. Price, included credits, feature flags, quantitative limits and AI configuration are frozen at activation. `Payment.planSnapshot` and `Payment.billingChange` preserve historical checkout context.

Higher-price upgrades receive unused-period proration from the current contracted snapshot price. Lower-price and equal-price branch changes are scheduled for period end. Since current Pesapal access is manually renewed rather than automatically charged, a scheduled next plan requires its own verified payment for the next paid period.

`monthlyTokenLimit` is enforced alongside AI credits and generation quotas. See `BILLING-AND-TOKEN-BUDGETS.md`.

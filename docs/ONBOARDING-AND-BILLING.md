# Onboarding, Plans, Money and Billing Journey

This document is the source of truth for how a customer moves from public pricing into an active AutoBrand workspace. Product copy, routes, checkout and quota calculations must agree with this journey.

## 1. Plan families

AutoBrand asks the customer to choose **how they want to work** before asking them to compare raw limits.

| Plan | Public price | Access | Generative AI | Main purpose |
|---|---:|---|---|---|
| Free Trial | US$0 | 7 days | Limited | Test the real workflow before paying |
| Publish | US$10 | 1 month | 0 included AutoBrand AI credits | Bring your own creative or connect ChatGPT/Codex; Drive, approvals, scheduling and analytics included |
| AI Starter | US$10 | 1 month | Yes | Entry-level AI-assisted content creation |
| Growth | US$20 | 1 month | Yes | Campaigns, approvals, AI video and limited automation |
| Pro | US$50 | 1 month | Yes | Higher-volume AI/video operations |
| Business | US$100 | 1 month | Yes | Larger teams, brands and operational capacity |
| Agency | US$150 | 1 month | Yes | Multi-client/agency scale |

`Superadmin` is an internal platform entitlement and is never a public customer plan.

## 2. Money representation

Customer-facing money uses one format everywhere:

- currency code/source of truth: `USD`;
- display prefix: `US$`;
- example: `US$10`;
- detailed access label: `US$10 · 1 month of access`;
- Free Trial: `US$0 · 7 days`.

Do not mix `$10`, `USD 10`, `10 USD`, and `US$10` across screens.

Pesapal is the payment provider. AutoBrand displays plan prices in US dollars. Pesapal may offer local payment methods. If a bank, wallet, card network or payment provider performs currency conversion, that provider's rate or fee may apply.

## 3. Current payment model — no automatic renewal

The current Pesapal implementation is **manual payment per access period**.

For a monthly paid plan:

```text
Choose plan
   ↓
Review US$ price + exact limits
   ↓
Pesapal checkout
   ↓
AutoBrand verifies GetTransactionStatus server-to-server
   ↓
One paid access period becomes active
   ↓
currentPeriodStart → currentPeriodEnd
   ↓
Access period ends
   ↓
Customer pays again through Pesapal if they want another period
```

AutoBrand does **not** automatically charge the next month and must not use wording such as "renews automatically", "recurring charge", or "renews until cancelled" unless a real recurring-payment implementation is later added and verified end to end.

The legacy database field `renewsAt` may exist for backward compatibility, but customer-facing product language uses **access through**, **access period end**, and **next payment**.

## 4. Free Trial onboarding

```text
Pricing
   ↓
Free Trial · US$0 · 7 days
   ↓
Create account / Google signup
   ↓
Trial entitlement activates
   ↓
/dashboard?welcome=1
   ↓
1. Build Brand Brain
2. Connect real social destinations
3. Create content
4. Review/approve if needed
5. Schedule or publish
6. Track analytics and plan usage
```

No Pesapal step is shown after successful Free Trial account creation. The trial does not automatically become a paid plan.

## 5. Paid-plan onboarding

```text
Pricing
   ↓
Choose exact paid plan
   ↓
Create account / Google signup
   ↓
Selected paid plan is stored as checkout intent only
   ↓
Review plan, US$ price, access length, AI budget and limits
   ↓
Pesapal
   ↓
Server-side verification
   ↓
Paid entitlement activates
   ↓
/dashboard?welcome=1
   ↓
Workspace setup journey
```

Starting checkout never grants paid capability. A callback/IPN notification alone never grants paid capability. The authoritative billing service verifies Pesapal server-to-server and activates entitlement idempotently.

## 6. Publish vs AI Starter at the same US$10 price

These are intentionally different products rather than "cheap" and "expensive" versions of the same workflow.

### Publish — US$10 · 1 month

Choose this when the customer brings their own creative work **or connects ChatGPT/Codex as their AI operator**. The tier includes zero AutoBrand generative-AI credits/quotas, but includes the ChatGPT connector, Google Drive integration, publishing infrastructure, deterministic validation/tools, scheduling, approvals, channel workspaces, analytics and recovery. ChatGPT-generated assets can be uploaded into AutoBrand/Drive without converting them into AutoBrand-billed AI generations.

### AI Starter — US$10 · 1 month

Choose this when the customer wants generative-AI assistance. It includes an AI credit budget and explicit AI generation limits, but has different workspace capacity from Publish.

Public and dashboard copy must always explain this difference when the two US$10 plans appear together.

## 7. Capacity, usage limits and AI credits

Three kinds of limits must not be mixed:

1. **Capacity** — how much can exist at once, for example brands, social accounts, team members and storage.
2. **Usage allowance** — how much can be used during the active trial/paid access period, for example scheduled posts, manual posts, AI generations and approval links.
3. **AI credits** — the AI spending budget for the active subscription period. AI generation-count limits remain separate safety ceilings; both can apply.

For paid subscriptions, usage is measured from `currentPeriodStart` to `currentPeriodEnd`. It does not reset on the first day of the calendar month merely because the date changed.

Example: if a verified monthly payment activates on September 18, the quota window follows that paid access period rather than September 1–30.

## 8. Plan switching

- Free/trial activation is handled explicitly and can never be granted twice when trial reuse is forbidden.
- Choosing a paid plan opens a review/checkout step.
- The old paid entitlement is not replaced merely because a user clicked another plan.
- The new paid entitlement activates only after verified Pesapal payment.
- Payment reversals/refunds revoke the entitlement linked to that payment according to the billing state machine.

## 9. Workspace billing ownership

A shared brand uses the brand/workspace owner's subscription for plan capability, quota and AI-cost accounting. The employee who clicks an action remains the audit actor but does not become the billing owner.

## 10. Required customer-facing surfaces

The same plan language must appear in:

- landing pricing preview;
- full pricing comparison;
- plan details;
- registration;
- Google signup intent;
- checkout review;
- Pesapal payment status;
- welcome onboarding;
- Plan & Billing dashboard;
- locked-feature upgrade prompts;
- admin Plan Management;
- receipts/payment history where a plan is referenced;
- help/terms/documentation.

When adding a plan field or changing billing semantics, update these surfaces and their regression tests together.

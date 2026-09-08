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

Manual Publisher is a distinct zero-AI product capability, not an AI tier with merely hidden controls. It has `manualPublisherAccess=true`, `smartComposerLevel=none`, zero AI quotas and zero included AI credits.

## Quota enforcement

Quota checks occur server-side before expensive or scarce operations. Atomic counters/updates are used where concurrency could overspend an allowance. Usage logs preserve actor and workspace context.

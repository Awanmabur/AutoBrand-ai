# Billing, Plan Contracts, Upgrades and AI Token Budgets

## Sources of truth

AutoBrand deliberately separates the live product catalogue from a customer's already-paid contract.

| Concern | Source of truth |
|---|---|
| New signup / new purchase price and capabilities | `SubscriptionPlan` |
| Current paid-period entitlements | `Subscription.planSnapshot` |
| Historical charged amount / commercial context | `Payment.amount` + `Payment.planSnapshot` + `Payment.billingChange` |
| Credits already consumed | `Subscription.creditsUsed` + `CreditLedger` |
| AI tokens already consumed | `Subscription.aiTokensUsed` |
| AI tokens in-flight | `Subscription.aiTokenReservations` / `aiTokensReserved` |

Changing a live plan in Superadmin changes future purchases. It does not rewrite an active customer's contracted price, included credits, feature flags, limits, provider/model policy or AI token allowance for the current paid period.

## Immutable paid-period plan snapshot

Every new activation stores a commercial snapshot containing the plan's:

- id/name/slug/description;
- price and currency;
- billing/access interval and trial days;
- included credits;
- queue priority;
- features;
- quantitative limits;
- AI configuration including token/image/video allowances and provider/model policy;
- public feature list;
- capture timestamp.

Entitlement checks resolve the active subscription's snapshot first. The mutable `SubscriptionPlan` record is only a fallback for legacy rows until migration backfills a snapshot.

## Pesapal and amount integrity

Paid access is never activated merely because a browser returns from checkout. AutoBrand reconciles the payment with Pesapal server-to-server and verifies the expected amount, currency, merchant reference and tracking id before activating the entitlement.

For an upgrade, the exact quote shown in the UI is persisted on the Payment and the exact amount is submitted to Pesapal. Successful activation uses the plan snapshot captured when that checkout was created.

## Upgrade proration

A higher-price plan is an immediate upgrade after verified payment.

The unused-value credit is calculated from the current contracted plan price, not from the mutable live catalogue:

`unused credit = current contracted price × unexpired fraction of the access period`

`amount due now = max(0, target plan list price − unused credit)`

Currency mismatch disables monetary proration rather than performing an unsafe implicit FX conversion.

The verified upgrade starts a fresh target-plan access period. The previous subscription is cancelled only after the new entitlement is safely activated.

If that upgrade payment is later reversed/refunded and the previous subscription's original period is still valid, AutoBrand can restore that previous entitlement for its remaining original period.

## Downgrades and equal-price branch switches

A lower-price plan change is not immediate. It is recorded on the current subscription as a pending `scheduledPlanChange` effective at `currentPeriodEnd`.

Equal-price branch switches are also period-end changes. This prevents a customer from hopping mid-period between plans such as Publish and AI Starter to consume allowances from both branches.

Because AutoBrand's current Pesapal product is manual access-period billing rather than automatic card renewal, a scheduled lower/equal-price plan does **not** silently charge or auto-activate itself. At period end the old entitlement expires and the target slug becomes the customer's next selected plan; the next paid period begins only after its own verified checkout/payment.

Users can cancel a pending scheduled plan change before it takes effect.

## AI token-budget enforcement

`monthlyTokenLimit` is now a real paid-period enforcement boundary, not a reporting-only field.

Before a text-model request leaves AutoBrand:

1. AutoBrand resolves the billing workspace and active subscription snapshot.
2. It removes expired abandoned reservations.
3. It calculates a conservative input-token upper bound from UTF-8 bytes plus message framing allowance.
4. It adds the maximum provider output-token cap and any explicitly configured retry/fallback multiplier.
5. It atomically reserves that amount only if `used + reserved + requested <= monthlyTokenLimit`.
6. The provider request receives a corresponding maximum output-token limit.
7. After completion, provider-reported token usage is preferred and the reservation is reconciled down/up to actual consumption.
8. If the provider does not return token usage, AutoBrand falls back to a documented local estimate.

The reservation has a unique id and a 30-minute expiry. A worker/process crash therefore cannot permanently strand a customer's allowance: abandoned reservations are removed and the aggregate reserved amount is recomputed on the next budget operation.

Provider usage parsing supports the response shapes used by OpenAI, Anthropic and Gemini-compatible adapters. Usage records retain whether the count came from the provider or the estimate fallback.

## AI credits versus token budgets

AI credits and tokens intentionally solve different problems:

- **AI credits** are AutoBrand's commercial unit for different expensive capabilities (text, image, video, avatar, campaign generation).
- **AI token limit** protects text-model consumption inside the paid period.
- **generation-count limits** add another hard product guard (for example image/video generation counts).

A request can therefore require all applicable checks: feature entitlement, generation quota, credits and token budget.

## Workspace billing

When a teammate operates a shared Brand, the Brand owner's subscription snapshot and quotas pay for the work. AutoBrand still records the acting user for auditability.

## Superadmin

`super_admin` remains the platform-level exception: feature/quantity/credit/token restrictions are treated as unlimited for administrative operation. Tenant authorization boundaries and provider safety requirements still apply.

## Production upgrade from older releases

Before deploying v1.4.0 to an existing database:

```bash
npm run migrate:production
```

Review the dry-run and database backup. The migration backfills:

- missing subscription commercial snapshots;
- AI used/reserved counters;
- the crash-safe token-reservation array;
- best-effort historical payment plan snapshots/change metadata.

Then deliberately apply:

```bash
npm run migrate:production:apply
```

After a fresh production dependency install, also run:

```bash
npm audit --omit=dev
NODE_ENV=production npm run preflight:runtime
```

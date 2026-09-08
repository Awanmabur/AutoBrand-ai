# Pesapal Billing

## Provider

Pesapal API 3 is the payment boundary for paid subscriptions.

## Entitlement rule

**Creating a checkout does not grant a plan.** A checkout creates a payment attempt. Only a server-verified completed Pesapal transaction can activate a paid entitlement.

## Flow

```text
Choose plan
   |
create Payment intent (pending)
   |
SubmitOrderRequest -> Pesapal redirect URL
   |
Customer pays
   |
Callback/IPN notification
   |
GetTransactionStatus from server
   |
verify merchant reference
verify tracking ID
verify amount
verify currency
   |
COMPLETED -> idempotent subscription activation
FAILED    -> no paid entitlement / revoke inconsistent entitlement
REFUNDED  -> terminal refund + revoke entitlement
REVERSED  -> terminal provider reversal + revoke entitlement
```

## Integrity checks

Reconciliation binds the provider response to the local payment using merchant reference, Pesapal tracking ID, expected amount and currency. A notification carrying identifiers alone is insufficient.

## Idempotency and concurrency

Subscription activation uses a unique payment-specific `activationKey`. Simultaneous IPNs/callbacks converge on one active subscription. Activation cancels only older subscriptions after the winning activation exists.

Payment updates use guarded state transitions so a stale later `COMPLETED` response cannot overwrite a newer terminal `REVERSED` state and resurrect access.

## Refund and reversal behavior

`refunded` and `reversed` are distinct persisted financial states. A refund represents money intentionally returned; a Pesapal `REVERSED` state represents a provider-side reversal. Both revoke the entitlement linked to that payment, both are terminal for that payment attempt, and neither can be overwritten by a stale later `COMPLETED` notification. Reconciliation must remain safe when messages arrive more than once or out of order.

## Production settings

Configure `BILLING_PROVIDER=pesapal`, `CHECKOUT_DEFAULT_PROVIDER=pesapal`, `PESAPAL_ENVIRONMENT=production`, the consumer key/secret, and either a registered `PESAPAL_IPN_ID` or intentional automatic IPN registration. Billing callback/IPN/cancellation URLs must be public HTTPS on the `APP_URL` hostname. `PUBLIC_APP_URL` may be a separate media origin and is never used for Pesapal callbacks. Production validation rejects sandbox mode and custom Pesapal API origins.

Never expose consumer secrets to the browser and never let generic webhooks modify payment state.

## Operational reconciliation

Callback/IPN is the fast notification path, not the only recovery mechanism. Every paid Pesapal checkout receives durable reconciliation state. A MongoDB-leased processor rechecks pending payments and periodically rechecks paid payments for later provider reversals. Polling frequency decreases as the payment ages to control provider/API cost. Transient failures use exponential backoff; missing legacy `OrderTrackingId` values are marked for manual finance review instead of being guessed.

Default one-service mode:

```env
PAYMENT_RECONCILIATION_WORKER_MODE=web
PAYMENT_RECONCILIATION_POLL_MS=60000
PAYMENT_RECONCILIATION_CONCURRENCY=2
PAYMENT_RECONCILIATION_PENDING_DAYS=7
PAYMENT_RECONCILIATION_PAID_DAYS=180
```

For a dedicated process set `PAYMENT_RECONCILIATION_WORKER_MODE=external` on the web and billing worker and run `npm run worker:billing`. Never select external mode without deploying that worker.

Investigate payments when local state and Pesapal disagree. Prefer provider truth plus local immutable/audit metadata. Do not manually set a subscription active without evidence of a verified transaction.

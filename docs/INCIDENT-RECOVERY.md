# Incident Recovery

## Suspected credential/key compromise

1. Restrict access and preserve logs.
2. Pause publishing if credentials could be abused.
3. Rotate affected app/provider secrets.
4. Revoke provider tokens/sessions.
5. For token-encryption rotation, temporarily configure previous key(s), verify decryption/reconnect, then retire old keys.
6. Review audit/API logs for unauthorized actions.
7. Notify affected users/partners according to applicable policy and law.

## Pesapal discrepancy

Do not manually grant access from a screenshot/callback. Reconcile against Pesapal server status, verify reference/tracking/amount/currency, inspect payment/subscription activation metadata, and preserve reversal terminality.

## Publishing/provider outage

Keep failed/retrying states durable. Do not convert them to published. Pause only when repeated retries risk provider abuse. Resume and rely on per-destination idempotency/recovery.

## Database outage

Readiness becomes 503 and database-backed work pauses/fails fast. Restore Mongo connectivity before replaying workers. Inspect backlog after recovery.

## Bad deployment

Roll back code, but do not roll back financial/provider state blindly. Database migrations require explicit compatibility planning; restore from backup only when that is the correct incident action.

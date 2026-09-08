# Operations

## Daily checks

Review readiness, failed posts, failed AI/video jobs, provider credential health, analytics sync backlog, payment reconciliation backlog/exhausted rows, deletion processor failures and unusual usage spikes.

## Publishing pause

`PAUSE_PUBLISHING=true` is the explicit emergency stop. Do not use deprecated scheduled-publishing flags to simulate an outage; the application intentionally avoids silently stranding scheduled work.

## Worker deployment

For a single-service deployment, web worker modes are acceptable. For scale, deploy dedicated AI/analytics workers and set the corresponding mode to `external`. Never set external mode without the worker process.

## Key rotation

Set a new `TOKEN_ENCRYPTION_KEY` and temporarily provide old values through `TOKEN_ENCRYPTION_KEY_PREVIOUS`. Re-encrypt/reconnect as operationally required, verify readiness, then remove old keys after the migration window.

## Backups

Back up MongoDB before migrations, large deletion operations, billing changes or major releases. Test restore procedures periodically.


## Database indexes

Every database connection verifies declared model indexes before the process begins normal work. Index creation is idempotent and does not drop operator-created indexes. If startup fails with `EDATABASEINDEXES`, investigate duplicate/conflicting legacy data and repair it; do not disable the integrity boundary.

## Distributed rate limiting

Redis is the preferred fast counter store when configured. If Redis is unavailable, the application uses MongoDB rate-limit buckets so all web instances still share counters. If MongoDB is also unavailable, normal application requests already fail readiness/database availability checks; a direct limiter-store failure in production is fail-closed rather than downgraded to process memory.


## Pesapal reconciliation

Normal deployments run reconciliation in the web process. Larger deployments may use `PAYMENT_RECONCILIATION_WORKER_MODE=external` plus `npm run worker:billing`. Pending payments are retried for the configured pending window; paid transactions are rechecked on a decreasing cadence for the configured paid monitoring window so later reversals can revoke entitlement. Rows marked `reconciliationStatus=exhausted` require finance review, especially legacy rows with no Pesapal tracking ID.

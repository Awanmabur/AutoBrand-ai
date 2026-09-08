# Observability

## Request tracing

Every HTTP request receives an `x-request-id`. Preserve it in logs and provider/API error reporting where practical.

## Health endpoints

- `/health` / `/healthz`: process health.
- `/readyz`: dependency readiness, including MongoDB state and Redis-enabled signal.

During Mongo reconnection, database-backed requests fail fast instead of waiting for long driver timeouts.

## Logs and audit data

Use application/API/audit records for provider calls, administrative actions, failed jobs, payments, authorization-sensitive operations and publishing recovery. Do not log passwords, tokens, API secrets or decrypted provider credentials.

## Metrics worth tracking externally

- request latency/error rate;
- Mongo/Redis connectivity;
- due publishing backlog;
- failed/retrying posts by provider;
- AI generation queue/backlog/failure rate;
- analytics sync backlog and unsupported count;
- Pesapal reconciliation failures/reversals;
- deletion backlog;
- AI credits/usage by plan and workspace;
- Manual Publisher publish volume and storage.

# Background Workers

## Responsibilities

- scheduled/immediate publishing;
- AI generation;
- provider analytics/status synchronization;
- account deletion processing;
- Pesapal payment/reversal reconciliation;
- retry/recovery tasks.

## Durability

MongoDB is the source of truth. Worker leases include ownership/expiry so crashed workers do not permanently strand work. Retry backoff prevents hot failure loops.

## Modes

AI, analytics and Pesapal reconciliation workers can run in the web process or a dedicated external process. Use external mode only when the corresponding worker process is actually deployed. Turning a mode off leaves related work intentionally unprocessed and is surfaced as a warning.

## Authorization in workers

A queue message is not a privilege token. Workers reload the brand and recheck the current required permission before performing delayed privileged actions. Job metadata preserves actor ID, brand ID, billing workspace ID and required permission for incident review.

## Redis

Redis/BullMQ can accelerate queueing and multi-instance behavior but MongoDB fallback/durable state prevents Redis availability from being the only correctness boundary. The web security boundary follows the same pattern: rate-limit counters use Redis when available and MongoDB otherwise; production never falls back to per-process memory.

## AI Brain worker process

When `AI_BRAIN_WORKER_MODE=external`, deploy `node workers/aiBrainWorker.js` as a continuously managed process. The production `Procfile` names this process `brainworker`. Do not set a worker mode to `external` unless the corresponding worker is deployed and health/exit alerts are configured; otherwise keep that responsibility in the web process.

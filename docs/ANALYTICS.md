# Analytics

## Truthfulness rule

AutoBrand never fabricates engagement. No provider data means “awaiting sync” or “unavailable”, not generated impressions/clicks/reach.

## Synchronization

Publishing creates durable analytics synchronization work. `AnalyticsSyncJob` is leased so multiple processes do not process the same provider/post/account job concurrently. Retry/backoff handles temporary failures; unsupported provider/account metric combinations become a durable unsupported state instead of retrying forever.

## Storage semantics

Analytics records store normalized provider snapshots and `availableMetrics`. A missing metric is different from zero:

- zero = provider measured zero;
- unavailable = provider/API/permission does not expose the metric.

CSV export leaves unsupported metrics empty rather than writing zero.

## TikTok asynchronous publishing

TikTok publishing may return a processing/publish identifier before a public post exists. AutoBrand keeps the destination in provider-processing state, resolves final publication status/public ID, then reads actual video metrics.

## Worker modes

`ANALYTICS_SYNC_WORKER_MODE` supports `web`, `external`, or `off`. In production, `off` intentionally disables real analytics sync and should normally be treated as an operational warning.

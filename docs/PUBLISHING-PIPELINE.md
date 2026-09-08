# Publishing Pipeline

## Destination resolution

A post belongs to a brand. Publishing resolves social credentials using `Brand.owner`, not `Post.createdBy`. This allows authorized team creators to publish through the shared workspace destination without owning the credential record.

## Flow

```text
Post ready/scheduled
  -> current brand permission/plan checks
  -> exact live destination account(s)
  -> provider-specific formatting
  -> provider API publish/initiate
  -> durable per-destination result
  -> retry or success
  -> analytics sync job
```

## Reliability

Publishing state is durable in MongoDB. Retry policy distinguishes retryable provider/network failures from permanent credential/decryption/configuration problems. Failed posts remain visibly failed instead of being converted to fake success.

## Mock protection

Development/mock social accounts are excluded from live destination resolution and publishing. Production migrations mark historical mock accounts as reconnect-required.

## Partial destination success

Multi-destination publishing tracks individual destination outcomes so successful platforms are not needlessly reposted when another platform needs retry.

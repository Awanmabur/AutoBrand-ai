# AutoBrand Platform Connectivity Recovery Report

Date: 2026-07-23  
Build: Resilient Runtime v7

## Evidence from the supplied runtime log

The application was not failing in the Facebook/Instagram publisher. Its infrastructure dependencies were repeatedly unavailable:

- Redis connection refused at `127.0.0.1:6379` hundreds of times.
- MongoDB Atlas shard DNS resolution failed with `getaddrinfo ENOTFOUND`.
- Mongoose reported `ReplicaSetNoPrimary` / `MongoServerSelectionError`.
- Scheduled publishing, AI generation recovery, AI media recovery, and generation worker ticks all retried independently, creating a log storm.

When MongoDB is unreachable, the platform cannot read queued posts, claim generation jobs, update statuses, or persist provider results. Redis is optional in this architecture and should never prevent the MongoDB fallback from operating.

## Runtime corrections

### Optional Redis is now truly optional

- `REDIS_HOST=127.0.0.1` alone no longer enables Redis.
- Redis activates only when `REDIS_URL` is present or `REDIS_ENABLED=true` is explicitly set.
- ioredis error events are consumed and rate-limited.
- Failed Redis probes close their connection cleanly before a later retry.
- Redis downtime uses MongoDB fallback without creating a notification for every post.
- Settings and provider diagnostics report Redis as optional and disabled when appropriate.

### MongoDB outage behavior is now safe

- AI generation and scheduled publishing check database readiness before querying.
- MongoDB connectivity failures use exponential backoff instead of retrying every worker interval.
- Repeated identical errors are logged at most once per configured log interval.
- Jobs and posts are left unchanged while the database is offline.
- On Mongoose `connected` or `reconnected`, workers wake immediately.
- HTTP routes return a fast `503 Database temporarily unavailable` response instead of waiting for server-selection timeouts.
- `/health`, `/healthz`, and `/readyz` remain available during an outage.
- `/readyz` reports MongoDB readiness and whether Redis is enabled.

### Connection diagnostics

A new command checks each layer independently:

```bash
npm run diagnose:connectivity
```

It reports:

- MongoDB URI root host
- SRV lookup results
- resolved Atlas shard addresses
- TCP connectivity to each returned host
- Redis enabled/disabled state
- Redis TCP connectivity when configured

It does not print database usernames, passwords, Redis passwords, or tokens.

## Recommended local environment

For a normal one-service development setup without Redis:

```env
REDIS_ENABLED=false
REDIS_URL=
REDIS_HOST=
REDIS_PORT=6379
```

The built-in MongoDB due-post publisher remains active.

To use Redis locally, start a real Redis service first and then set:

```env
REDIS_ENABLED=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

## Windows recovery for the supplied Atlas DNS failure

Run:

```bat
ipconfig /flushdns
npm run diagnose:connectivity
```

If Atlas SRV or shard lookup still fails:

1. Disable or change any VPN, proxy, DNS filter, antivirus web shield, or restrictive network.
2. Set Windows DNS temporarily to a reliable resolver such as `1.1.1.1` and `8.8.8.8`.
3. Run the diagnostic again.
4. Copy a fresh connection string from MongoDB Atlas **Connect → Drivers** into `MONGO_URI`.
5. Confirm Atlas Network Access allows the current public IP.
6. If IPv6 routing is broken, set `MONGO_IP_FAMILY=4` and restart the application.

`ENOTFOUND` is a DNS failure. Atlas IP allow-list rejection normally occurs after DNS resolution, so fixing the DNS/network layer comes first.

## Verification

- JavaScript syntax gate: 229 files passed.
- Static security gate: 228 files passed.
- Focused connectivity, Redis fallback, Mongo backoff, and publishing durability tests: 11 passed.
- Full repository discovery: 171 tests; 164 passed.
- Seven test files could not load because the verification container did not have installed `mongoose` / `jsonwebtoken` packages. There were no assertion failures among the tests that executed.
- No `.env`, local token-encryption key, provider token, generated media, dependency directory, cache, or log file is included in the delivery.

# Security

## Security model

Security is layered. No single middleware is treated as sufficient.

### Request boundary

- Helmet security headers and CSP.
- `x-powered-by` disabled.
- HSTS in production.
- strict referrer policy and permissions policy.
- body-size and parameter limits.
- request sanitization.
- request IDs for traceability.
- global and endpoint-specific distributed rate limiting: Redis primary when configured, MongoDB shared fallback, and fail-closed behavior if both shared stores are unavailable in production.
- CSRF protection for authenticated browser mutations.
- authentication and verified-account middleware on sensitive dashboard routes.

### Authentication

Access and refresh JWTs use separate secrets, issuer/audience checks and centralized verification. Refresh tokens rotate and reuse is detected. Session limits and login lockout reduce credential abuse. Passwords are hashed with bcrypt. Email verification and password reset use expiring, hashed tokens.

### OAuth account linking

Google sign-in does not auto-link an account merely because the email matches. Linking begins from an authenticated settings session, requires step-up/password reauthentication where applicable, uses purpose-bound one-time OAuth state, rejects a Google identity already attached to another user, and prevents unlinking the final login method.

### Authorization

`assertBrandAccess` is the authoritative brand boundary. Team roles map to explicit permissions such as `content.create`, `content.edit`, `content.publish`, `social.manage`, `approvals.manage`, `analytics.view`, `team.manage` and `billing.manage`.

UI hiding is never authorization. Controllers and delayed workers recheck permission.

### Credential encryption

Provider access/refresh tokens are encrypted using authenticated encryption. `TOKEN_ENCRYPTION_KEY` must be a stable unique secret in production. Previous keys may be supplied during rotation. Development-generated keys live outside the source tree under the user home directory by default.

Never commit or package encryption keys. If a key is lost, affected social accounts must be reconnected.

### Remote media and SSRF

Remote URLs are fetched only through the centralized safe fetcher. It validates scheme, resolves DNS, blocks loopback/private networks, limits redirects, limits response size and verifies returned content type. Production remote media requires HTTPS where enforced by the calling flow.

### Provider/webhook trust

Generic AutoBrand HMAC webhooks cannot impersonate Meta/TikTok/etc. and cannot mark Pesapal payments paid. Provider-specific verification belongs to the provider adapter. Pesapal state changes are based on server-side `GetTransactionStatus` reconciliation and integrity checks.

### Secret management

Production secrets belong in the deployment secret manager/environment, not the repository. Required security secrets are distinct and sufficiently long. `.env`, `.autobrand-token-key`, private keys, keystores, uploads, logs and archives are rejected by the release gate.

### Static release controls

Run:

```bash
npm run security:static
npm audit --omit=dev --offline
npm run release:scan
```

The release gate also detects embedded private keys, hard-coded high-risk secret assignments, nested archives and production mock URLs.

## Incident response basics

For suspected credential compromise: pause publishing if necessary, rotate the affected secret, retain the previous token-encryption key only during controlled migration, revoke provider tokens/sessions, review audit/API logs, reconnect affected destinations, verify Pesapal reconciliation, and document the incident. See `INCIDENT-RECOVERY.md`.


## Database integrity indexes

AutoBrand does not rely on Mongoose `autoIndex` in any environment. A central startup index manager explicitly creates every schema-declared index and refuses to start if an integrity index cannot be established. Migration-aware upgrade logic handles the known legacy non-unique Payment `provider + reference` index only after checking for duplicate financial references; duplicates stop the process without automatic deletion. This protects uniqueness/idempotency boundaries such as payment references, subscription activation keys, OAuth/webhook replay records, team membership keys, analytics jobs, refresh-token TTLs, and rate-limit buckets.


## Privileged bootstrap

The production superadmin seeder has no default privileged email/password path. New superadmin creation requires an explicit validated email and strong password. An existing non-superadmin account cannot be promoted implicitly; the operator must set the explicit `SUPERADMIN_ALLOW_PROMOTION=true` safety latch after verifying the target account.

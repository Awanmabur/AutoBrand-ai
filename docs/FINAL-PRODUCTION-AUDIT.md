# Final Production Audit — v1.6.0

## Security controls

- exact-host production validation and HTTPS-only production URLs
- CSP with nonces for executable inline content, HSTS, frame denial, no-sniff, referrer/permissions policies
- short-lived access JWTs, rotating refresh tokens, reuse detection, session revocation, token-version invalidation
- `__Host-` production auth/CSRF/transient cookies
- CSRF + same-origin mutation protection
- durable rate limits with Redis/Mongo shared state
- role, workspace, plan and provider-readiness authorization at backend action boundaries
- privileged-account email MFA support with server-side expiring challenges, browser binding and attempt caps
- encrypted provider credentials at rest and key-rotation support
- OAuth/PKCE/state handling for social, Google and MCP flows
- server-to-server Pesapal reconciliation before entitlement activation
- webhook HMAC/timestamp validation and unique event idempotency
- SSRF-safe external fetches with DNS/private-address/port/MIME/signature controls
- external assets are ingested into controlled storage rather than retained as arbitrary remote URLs
- signed GridFS public media URLs plus production migration for legacy unsigned references
- sensitive query/path values excluded from production request logs
- private routes carry noindex policy
- delayed account deletion with provider revocation, workspace purge and retained-record pseudonymization

## Product integrity

- one Brand Brain per brand across plans
- manual, ChatGPT Operator, and AutoBrand Brain operating paths use common RBAC/entitlement/storage/publishing infrastructure
- user-owned Google Drive storage remains scoped to the connected user
- Superadmin bypasses commercial limits without bypassing tenant isolation
- immutable paid-period plan snapshots, prorated upgrades, scheduled downgrades and hard AI token budgets
- background Brain worker is present in process declarations

## Public discovery

- canonical pages, sitemap, robots, Open Graph/Twitter metadata
- Organization + SoftwareApplication + WebSite JSON-LD
- ChatGPT/OpenAI search crawler allowed independently from training crawler preference
- Apple search crawler separated from Apple training preference
- `llms.txt` / `llms-full.txt` supplied as supplementary machine-readable product context

## Release evidence

The code release must pass, from the clean staged tree:

- syntax check
- full automated test suite
- static security gate
- source production preflight
- release secret/mock scan
- dependency audit available to the environment
- release SHA-256 manifest verification after re-extracting the final archive

## Deployment-only validation

No source archive can prove production-provider state. Before accepting real customers, separately validate:

- DNS/TLS/CDN/WAF behavior
- MongoDB backup and restore drill
- Redis/queue behavior under restart
- real SMTP delivery and privileged MFA
- real Pesapal production callback/IPN reconciliation
- every enabled social provider OAuth + publish + analytics permission set
- Google Drive production OAuth
- ChatGPT/MCP OAuth connection through the deployed public `/mcp` endpoint
- live provider token expiry/reconnect behavior
- alerting and incident contacts
- legal/privacy/terms review for launch jurisdictions

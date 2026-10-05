# Testing

## Commands

```bash
npm run lint
npm test
npm run security:static
npm audit --omit=dev --offline
npm run preflight:source
```

Use `npm run preflight:runtime` after a fresh Linux install with production-like environment values.

## Critical regression domains

Permanent tests cover or should continue to cover:

- unpaid Pesapal checkout cannot grant entitlement;
- payment integrity fields and reversal terminality;
- workspace worker tenancy/current permission checks;
- Google email pre-registration cannot auto-link/take over an account;
- shared workspace destination ownership;
- Publish zero-AI limits and template renderer cost 0;
- analytics truthfulness/no fabricated metrics;
- credential decryption failures require reconnect rather than infinite retries;
- publishing partial success/recovery;
- account deletion lifecycle;
- secret-key stability/rotation;
- release/static security invariants.

## Native media tests

Sharp/FFmpeg tests require platform-correct native optional dependencies. A source archive recovered from Windows may skip these tests on Linux if its copied `node_modules` is reused. Never deploy copied `node_modules`; run a fresh `npm ci --include=optional`. Runtime preflight makes this fail closed in production.

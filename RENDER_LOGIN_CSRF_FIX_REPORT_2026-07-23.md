# AutoBrand AI Render Login and CSRF Repair

## Incident

Render successfully built and started the web service, but `POST /auth/login` returned HTTP 419. The error handler then attempted to use `layouts/main.ejs` before the normal view-local middleware had assigned `appName`, causing a second exception: `appName is not defined`.

## Root causes

1. Baseline EJS locals were assigned after CSRF middleware. Any CSRF failure occurred before `appName`, `currentPath`, `user`, and `csrfToken` were guaranteed.
2. The original double-submit flow required the browser cookie and hidden form value to match exactly. A missing cookie, stale cookie after a secret change, or duplicate legacy cookie caused a permanent 419 loop even when the submitted token was authentically signed and the request was same-origin.
3. The production cookie reused the generic `csrfToken` name, allowing older host/domain cookie collisions.
4. `package.json` allowed any Node version greater than 20, so Render selected Node 26.5.0 rather than a validated LTS major.

## Corrections

- Baseline view locals are assigned before database, authentication, and CSRF middleware.
- Every shared EJS layout has a defensive `AutoBrand AI` fallback.
- Error rendering explicitly supplies `appName`, `currentPath`, and `user`.
- Production uses the host-only `__Host-autobrand-csrf` cookie.
- The legacy `csrfToken` cookie is cleared during migration.
- A valid signed same-origin form token can repair a missing or stale cookie.
- Cross-site requests and invalid/unsigned tokens remain rejected.
- CSRF rejection logs contain a reason and request ID but never token contents.
- Node is pinned to `24.x`.
- Render deployment guidance now uses `npm ci`, `npm start`, and `/health`.

## Verification

- Six focused CSRF/layout tests passed.
- Missing-cookie recovery passed.
- Stale-cookie recovery passed.
- Invalid-token rejection passed.
- Cross-site rejection passed.
- All 229 JavaScript files passed syntax validation.
- All 228 inspected JavaScript files passed the static security gate.

## Required Render variables

```env
NODE_ENV=production
APP_URL=https://autobrand-ai.onrender.com
PUBLIC_APP_URL=https://autobrand-ai.onrender.com
TRUST_PROXY_HOPS=1
```

Keep `COOKIE_SECRET` and `CSRF_SECRET` stable and distinct. Do not rotate them on each deployment.

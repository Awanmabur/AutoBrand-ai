# Verification Report — 2026-07-22

## Completed gates

### Syntax

```text
Syntax OK: 218 JavaScript files checked.
```

### Static security

```text
Security gate passed: 217 JavaScript files inspected.
Review notice: Pesapal provider contains a local development URL.
```

### Tests

```text
Tests discovered: 142
Passed: 135
Assertion failures: 0
Dependency-load failures: 7
```

The seven test files that could not load require `mongoose` or `jsonwebtoken`:

- `test/accountService.test.js`
- `test/approvalWorkflow.test.js`
- `test/composerPayloadValidation.test.js`
- `test/notificationWorkflow.test.js`
- `test/postGeneration.test.js`
- `test/publishingReadiness.test.js`
- `test/usageLimits.test.js`

The configured npm registry returned HTTP 503, so `npm ci` could not install those dependencies in the verification environment. `npm ls --package-lock-only --all` passed, confirming the lock-file dependency tree is internally consistent.

### Focused runtime tests

Verified:

- legacy false flags cannot disable publishing or web AI generation;
- explicit pause/off controls still work;
- Redis failure falls back to the MongoDB publisher immediately;
- stale/legacy/approval-released posts are recovered;
- schedule versions are carried into publishing claims;
- Kampala dates convert correctly on UTC hosts;
- local media paths convert to public URLs;
- post format cannot be replaced by an incompatible media preset;
- X image upload occurs before post creation;
- X video follows initialize, append, finalize, then post creation;
- X old-scope accounts are required to reconnect for `media.write`;
- startup generation recovery does not block the HTTP listener.

## Packaging checks

The final package excludes:

- `node_modules`
- `.git`
- temporary AI render directories
- generated test media
- real `.env` files and secrets

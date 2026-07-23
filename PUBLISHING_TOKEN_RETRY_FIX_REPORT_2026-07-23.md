# AutoBrand Publishing Token & Retry Repair

Date: 2026-07-23

## Confirmed runtime failure

The supplied runtime log shows that the post completed AI generation and reached both selected Meta destinations. Both provider jobs then failed before any Meta API response with:

`Unsupported state or unable to authenticate data`

That message is emitted by AES-GCM token decryption when the stored Facebook and Instagram access tokens were encrypted using a different `TOKEN_ENCRYPTION_KEY`. Both destinations failed identically, confirming a local credential-decryption failure rather than a Facebook/Instagram publishing rejection.

The development configuration previously generated an in-memory encryption key whenever `TOKEN_ENCRYPTION_KEY` was absent. A nodemon restart or source replacement therefore made previously connected social tokens unreadable. The retry policy did not classify this OpenSSL error as permanent, so the failed post was changed back to `scheduled` and picked up repeatedly.

## Corrections

- Development now persists an automatically generated key in `.autobrand-token-key` instead of changing it on every restart.
- Explicit `TOKEN_ENCRYPTION_KEY` remains the recommended deployment setting.
- Added `TOKEN_ENCRYPTION_KEY_PREVIOUS` for safe key rotation and recovery of old v1/v2 encrypted tokens.
- New token payloads carry a non-secret key fingerprint so the correct current/previous key can be selected.
- Token failures now return `TOKEN_DECRYPTION_FAILED` with a clear reconnect/key-restoration message.
- Credential decryption failures are permanent and never enter automatic publishing retry.
- Startup scans connected/previously failed social accounts before the due-post publisher starts.
- Undecryptable accounts are changed to `needs_reconnect`.
- Scheduled/publishing posts targeting those accounts are changed to `failed`, their schedule is cleared, and the schedule version is invalidated.
- Restoring a previous key automatically restores accounts that were marked `needs_reconnect` specifically because of encryption-key rotation.
- Quick Create, Schedule, Publish Now, edit-to-scheduled and manual Retry now verify that selected account credentials are decryptable before queueing.
- Manual Retry no longer schedules a post whose destinations need reconnection.
- The publishing account health record now explains that the old key must be restored or the account reconnected.
- `npm run repair:publishing` performs the credential scan and stops already-looping posts.

## Existing account recovery

If the old encryption key is known:

```env
TOKEN_ENCRYPTION_KEY=<new-current-key>
TOKEN_ENCRYPTION_KEY_PREVIOUS=<old-key-used-for-existing-tokens>
```

Restart and run:

```bash
npm run repair:publishing
```

If the old key is unknown, encrypted tokens cannot be mathematically recovered. Configure one stable key, restart, reconnect Facebook/Instagram once, and retry the failed post.

Generate a stable key with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Verification

- 224 JavaScript files passed syntax checks.
- 223 JavaScript files passed the static security gate.
- 28 focused publishing/runtime tests passed.
- 8 dedicated token stability, rotation, permanent retry and startup-wiring tests passed.
- Full repository discovery: 155 tests; 148 passed and 7 test files could not load because dependencies such as `mongoose` were not installed in the archive environment. There were no executable assertion failures.

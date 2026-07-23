# Security Audit Report — 2026-07-22

## Publishing-related protections

- Atomic MongoDB claims prevent two workers from publishing the same due record.
- `scheduleVersion` invalidates old delayed jobs after cancel/reschedule/retry changes.
- Approval is enforced again inside the publisher, not only in the UI/controller.
- Production mock social accounts are hidden and rejected.
- OAuth state validation uses signed state; TikTok and X use timing-safe signature comparison.
- Provider access/refresh tokens remain encrypted through `TOKEN_ENCRYPTION_KEY`.
- Provider calls use bounded timeouts.
- Remote media fetching retains URL/MIME/size controls.
- Public-media conversion rejects localhost/non-public origins.
- Provider errors are persisted without turning failures into mock success.
- Notifications are best effort and cannot roll back a successful schedule or publish state change.

## Environment protections

Production validation requires:

- HTTPS `APP_URL` and public URL;
- six distinct random secrets of at least 32 characters;
- refresh lifetime longer than access lifetime;
- non-local MongoDB;
- SMTP delivery for verification/reset;
- development email links disabled;
- complete Cloudinary settings when local video fallback is allowed.

## Verification

`npm run security:static` passed for 217 JavaScript files. One informational notice remains for a local URL in the Pesapal sandbox/development provider path and should remain restricted to non-production configuration.

A live penetration test and real provider-permission review were not possible without deployed infrastructure and credentials.

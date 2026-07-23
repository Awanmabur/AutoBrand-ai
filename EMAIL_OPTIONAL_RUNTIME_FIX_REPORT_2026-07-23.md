# AutoBrand AI — Optional Email Runtime Fix

Date: 2026-07-23
Version: 1.0.3 / v9

## Reported failure

The server stopped during environment validation when `NODE_ENV=production` was used without complete SMTP settings:

`SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM are required in production...`

This made unrelated platform features—login, publishing, scheduling, campaigns, AI generation, and connected social accounts—unavailable even though email delivery was the only missing integration.

## Implemented behavior

Email delivery now has three explicit modes:

- `optional` (default): the platform starts without SMTP. Email verification is disabled unless explicitly enabled. Password reset email, verification resend, login-email changes, and team invitation email delivery return controlled unavailable messages.
- `required`: startup fails closed unless complete SMTP settings are supplied. Use this when verification and recovery email must be guaranteed.
- `disabled`: the platform never sends email, even if SMTP variables exist.

`EMAIL_VERIFICATION_REQUIRED` defaults to true only when email delivery is actually enabled. It can be explicitly configured.

## Safety controls

- Incomplete SMTP settings no longer crash optional mode; they produce a warning and email remains disabled.
- `EMAIL_DELIVERY_MODE=required` still fails closed without complete SMTP.
- `EMAIL_VERIFICATION_REQUIRED=true` still requires enabled SMTP.
- Production development-link exposure remains forbidden.
- New accounts are marked verified only when verification is explicitly not required.
- Existing unverified users are not blocked by `requireVerified` when verification is disabled globally.
- Password reset does not generate unusable reset tokens when email is unavailable.
- Login email changes remain blocked without verification delivery.
- Team invitations remain blocked without email delivery rather than creating unusable invitations.
- Dashboard settings show that verification is disabled and email changes are unavailable.

## Recommended no-SMTP configuration

```env
EMAIL_DELIVERY_MODE=optional
EMAIL_VERIFICATION_REQUIRED=false
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
ALLOW_DEVELOPMENT_EMAIL_LINKS=false
```

## Recommended full production email configuration

```env
EMAIL_DELIVERY_MODE=required
EMAIL_VERIFICATION_REQUIRED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-password
EMAIL_FROM=AutoBrand AI <no-reply@your-domain.example>
ALLOW_DEVELOPMENT_EMAIL_LINKS=false
```

## Verification

- JavaScript syntax: 229 files passed.
- Static security inspection: 228 files passed.
- Focused optional-email tests: 5 passed.
- Full repository test discovery: 185 tests; 178 passed.
- Seven suites could not load because `mongoose` or `jsonwebtoken` was unavailable in the packaging environment; no executable assertion failed.
- Dashboard EJS balance test passed.

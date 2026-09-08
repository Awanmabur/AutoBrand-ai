# Authentication

## Login methods

AutoBrand supports password authentication and Google OAuth. A user account may use both only after explicit secure linking.

## Password lifecycle

- Enforce the server password policy (currently minimum 12 characters plus service validation).
- Hash passwords; never store reversible passwords.
- Login failures participate in lockout/rate limiting.
- Password reset tokens are random, expiring and stored only as hashes.
- Changing/recovering a password should invalidate inappropriate old sessions.

## Email verification

When required by deployment configuration, sensitive dashboard routes require a verified account. Production verification depends on configured email delivery; development-only verification links must be disabled in production.

## Refresh sessions

Refresh tokens rotate. Reuse of an old rotated token is considered suspicious and invalidates the affected token family/session. Active-session limits prevent unbounded token accumulation.

## Google sign-in

Google login searches for the already-linked Google identity. It does not attach Google to an existing password account based solely on email equality.

### Explicit linking

1. User signs in normally.
2. User opens security/account settings and chooses Link Google.
3. Password-capable accounts complete step-up reauthentication.
4. Server generates purpose-bound one-time OAuth state.
5. Google returns the verified identity.
6. Server confirms the Google identity is not owned by another account.
7. Link is persisted and audited.

Unlinking is blocked if it would leave the account with no usable login method.

## Authentication threat cases covered

- pre-registration takeover through email-only OAuth linking;
- refresh-token replay/reuse;
- brute force via login lockout/rate limits;
- stolen reset token database records via hashed reset tokens;
- CSRF on browser mutations;
- cross-account OAuth state reuse;
- accidental removal of the final authentication method.

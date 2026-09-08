# Social Integrations

## Supported architecture

Each provider has its own OAuth/token/publish/analytics adapter. Provider-specific authentication rules must not be replaced with one generic webhook or token format.

Current publishing/analytics integration code covers combinations of Facebook, Instagram, Threads, TikTok, YouTube, LinkedIn, Pinterest, X and Google Business according to provider capability and configured credentials.

## Credential ownership

`SocialAccount` belongs to a brand and uses the brand owner as credential owner/billing workspace. The team member who performs connection management needs `social.manage` but does not become the credential owner.

## Destination identity

A real provider destination is uniquely identified inside a workspace brand by `brand + platform + accountId`. MongoDB enforces this with a partial unique index for non-empty provider account IDs. OAuth/manual connection code upserts by that same identity, so simultaneous callbacks cannot create duplicate destination rows. Production migration normalizes old identifiers and safely merges duplicates before the unique index is installed.

## Health states

Production-ready accounts are real connected accounts with usable credentials and required capability. Expired, failed and reconnect-required states remain visible. `mock` is development legacy only: it is rejected for live publishing and excluded from paid social-account quota usage.

## Disconnect behavior

Disconnect cleanup is brand-scoped. It reconciles posts/campaigns that refer to the removed destination regardless of which team member created them.

## Provider changes

Social APIs evolve. Keep scopes, API versions, upload limits, token lifetimes and analytics permissions configurable/tested and review provider release notes before production upgrades.

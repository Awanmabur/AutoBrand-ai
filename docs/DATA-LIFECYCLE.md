# Data Lifecycle

## Brand lifecycle

Brands support active and archived states. Archive disables operations such as Auto Posting; archived brands remain discoverable for restore rather than disappearing silently.

## Content/media lifecycle

Draft/scheduled/published/failed/cancelled states remain explicit. Media can be archived and is then excluded from new selection. Fake historical analytics/video records are removed or invalidated by the production migration.

## Financial records

Financial/payment records required for accounting, reconciliation, fraud/security and legal obligations should be retained with personal data minimized rather than blindly deleted with marketing content.

## Credential lifecycle

Provider credentials are encrypted. Disconnect/reconnect updates credential readiness. Account deletion destroys credentials/sessions according to the deletion processor.

## Release artifacts

Runtime/generated data is never part of a source release. `.env`, logs, uploads, generated media, caches, keys, archives and `node_modules` are excluded and scanned.
## MCP connection lifecycle

An MCP/ChatGPT connection has explicit authorization-code, grant, access-token and rotating refresh-token state. Authorization codes are short lived and one-time. Refresh-token families are replay protected. Access tokens are short lived and can be invalidated before expiry through grant/access-token revocation.

Revoking a client from AutoBrand Settings revokes the durable MCP grant and associated active refresh tokens; subsequent access-token validation also fails because the grant is no longer active. Full account deletion removes MCP authorization codes, refresh tokens, grants and access-token revocation records together with the user's other authentication/session state.

Creative files entering through MCP become normal AutoBrand `Media` records and follow the same archive/storage/deletion lifecycle as media uploaded through the dashboard. Scheduled or published posts created through MCP are normal AutoBrand `Post` records and follow the same status, audit, retry and analytics lifecycle.



## Google Drive lifecycle

Google Drive is user-owned external storage. AutoBrand stores encrypted OAuth credentials and Drive metadata while the connection is active. Drive-only `Media` records may contain the provider file ID, folder ID, Drive web-view link and an unguessable AutoBrand proxy token required for provider publishing.

Disconnecting Drive revokes AutoBrand's provider token best-effort and clears its stored OAuth credentials. Account deletion also attempts this revocation before deleting the `CloudStorageConnection` record. **Neither disconnect nor AutoBrand account deletion deletes files in the user's Google Drive.** Users remain responsible for deleting Drive-owned files from Google Drive itself.

## v1.6 deletion additions

Account deletion removes outstanding privileged login challenges and brand-scoped analytics-sync jobs. Public contact inquiries matching the deleted account email are pseudonymized to the deleted identity instead of keeping the account email/name. Financial/audit records continue to follow the documented retention/pseudonymization rules rather than being silently destroyed where accounting, fraud, security or dispute evidence is required.

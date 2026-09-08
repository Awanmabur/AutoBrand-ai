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

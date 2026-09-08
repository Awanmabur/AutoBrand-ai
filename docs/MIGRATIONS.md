# Production Data Migration

## Commands

Dry run:

```bash
npm run migrate:production
```

Apply only after review and backup:

```bash
npm run migrate:production:apply
```

## Current migration responsibilities

- backfill brand ownership on approvals/client approval links;
- normalize `SocialAccount.owner` to `Brand.owner`;
- detect `brand + platform + accountId` collisions using normalized identity values, re-point Post/Campaign/analytics references and delete duplicates, then normalize the surviving social identifiers before installing the database unique index;
- disable legacy mock social connections without charging them against active social-account quota;
- normalize workspace ownership and `createdBy` attribution for Growth Assets and Avatar Profiles;
- normalize legacy subscription-period credit counters;
- delete fabricated `Analytics.source=mock` records;
- invalidate mock video/render/media artifacts;
- suspend paid entitlements that cannot be linked to server-verified Pesapal payment evidence;
- normalize historical Pesapal records that were previously stored as `refunded` even though provider evidence says `REVERSED`;
- seed analytics sync work for legitimate previously published content.

## Procedure

Always take a database backup first. Run dry-run against a production snapshot, inspect unresolved/orphan counts, fix unexpected references, then apply during a controlled deployment. The apply path intentionally connects **without creating new indexes**, repairs/deduplicates historical data first, then creates/verifies the current schema indexes. This ordering prevents a new unique index from making a dirty historical database impossible to migrate. Re-run dry-run afterward; expected update counts should fall to zero or known idempotent values.


## Payment reconciliation backfill

The production migration seeds reconciliation state for legacy Pesapal `pending` and `paid` payments. Rows with a recoverable tracking ID are scheduled; rows missing an `OrderTrackingId` are marked exhausted for explicit finance review. This migration never fabricates provider identifiers or payment truth.

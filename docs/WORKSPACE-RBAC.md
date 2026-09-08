# Workspace RBAC

## Principle

A brand is a workspace. Ownership and authorship are different concepts.

```text
Brand.owner -> billing/security owner
TeamMember  -> membership + role + explicit permissions
createdBy   -> audit actor only
```

## Access resolution

Use the centralized brand-access service for brand operations. It considers direct ownership and active team membership. Controllers must request the permission needed for that action.

Typical permissions:

- `brand.manage`
- `social.manage`
- `content.create`
- `content.edit`
- `content.publish`
- `schedule.manage`
- `approvals.manage`
- `analytics.view`
- `team.manage`
- `billing.manage`

## Billing resolution

Quotas, AI credits, social-account limits and workspace plan features resolve to `Brand.owner`. The employee initiating an action remains the actor in audit/usage records.

## Resource rules

- Posts/campaigns/media/video jobs/approvals/analytics are queried by `brand`.
- Social credentials use `brand` plus `owner=Brand.owner`.
- Growth assets and avatar profiles store workspace owner separately from `createdBy`.
- Disconnect cleanup searches all affected records by brand/destination, never by creator.
- Client approval limits are counted across the paying workspace, not the employee who created the links.

## Background jobs

Queued generation records persist actor ID, brand ID, billing workspace ID and the required permission. Recovery rechecks current membership/permission before performing a delayed publish. Removing a user from a workspace therefore prevents stale jobs from becoming a privilege bypass.

## UI rule

The dashboard may hide inaccessible controls for clarity, but the server must still reject unauthorized direct requests. Never use UI visibility as a security boundary.

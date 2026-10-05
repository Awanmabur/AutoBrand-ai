# AutoBrand AI Production Documentation

This directory is the operational source of truth for the production architecture. Read it in this order when onboarding a developer or preparing a release:

1. `ARCHITECTURE.md` — system boundaries and data ownership.
2. `SECURITY.md` and `AUTHENTICATION.md` — security controls and identity lifecycle.
3. `WORKSPACE-RBAC.md` — shared-brand authorization and billing ownership.
4. `ONBOARDING-AND-BILLING.md`, `PLANS-AND-ENTITLEMENTS.md`, `PESAPAL-BILLING.md`, `AI-COST-CONTROL.md` — customer journey and commercial controls.
5. `MANUAL-PUBLISHER.md` — the US$10 / 1-month zero-AI product.
6. `CONTENT-PIPELINE.md`, `MEDIA-PIPELINE.md`, `PUBLISHING-PIPELINE.md`, `SOCIAL-INTEGRATIONS.md` — creation through provider publishing.
7. `ANALYTICS.md`, `BACKGROUND-WORKERS.md`, `OBSERVABILITY.md` — asynchronous runtime behavior.
8. `DATA-LIFECYCLE.md`, `ACCOUNT-DELETION.md`, `MIGRATIONS.md` — retention and upgrades.
9. `TESTING.md`, `DEPLOYMENT-RUNBOOK.md`, `OPERATIONS.md`, `INCIDENT-RECOVERY.md`, `PRODUCTION-CHECKLIST.md` — release and incident operations.

The code wins if documentation and implementation ever disagree. Update both in the same change.

## ChatGPT / MCP

- [`SOCIAL-OPERATING-SYSTEM.md`](SOCIAL-OPERATING-SYSTEM.md) — product/UX source of truth for the unified social operating loop, ChatGPT operator, Drive and channel workspaces.
- [`MCP-CONNECTOR.md`](MCP-CONNECTOR.md) — ChatGPT/Codex remote MCP connector, OAuth, tools, media flow, deployment and testing.


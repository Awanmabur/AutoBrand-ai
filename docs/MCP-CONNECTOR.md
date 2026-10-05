# AutoBrand AI ChatGPT / Codex MCP Connector

AutoBrand AI exposes its own remote MCP endpoint at `/mcp`. This is the preferred integration path for ChatGPT and Codex: AutoBrand remains the source of truth for brands, team permissions, social-provider OAuth credentials, durable media, scheduling, publishing, analytics, retries and audit logs.

The connector is deliberately a thin adapter over AutoBrand's production services. It does **not** duplicate Facebook, Instagram, LinkedIn, TikTok, X, YouTube, Pinterest, Threads or Google Business publishing logic.

## Supported MCP protocol eras

The server supports both MCP lifecycle eras used by current clients:

- `2026-07-28` modern/stateless era via `server/discover`
- `2025-11-25`, `2025-06-18`, and `2025-03-26` handshake-era clients via `initialize`

The modern response path includes `resultType`, server identity metadata, and conservative private cache hints for discovery/tool-list results. Unknown modern revisions are rejected with the supported-version error instead of being silently accepted.

## Available tools

### Identity and discovery

- `get_profile` — standard authenticated profile tool for connected-account identification
- `list_brands` — brands/workspaces the AutoBrand user can access
- `get_brand` — brand voice, pillars, styling preferences and effective permissions
- `list_connected_accounts` — live social destinations plus readiness/blockers

### Media, storage and drafts

- `get_storage_status` — reports AutoBrand/Google Drive storage readiness and the user preference
- `list_media` — browses the user-accessible AutoBrand media library
- `sync_media_to_drive` — backs an existing AutoBrand asset up to the connected Drive
- `upload_media` — imports a ChatGPT/user file with `platform`, `google_drive`, or `both` storage destination
- `create_draft` — creates a manual post draft
- `update_draft` — edits a draft before publishing

### Publishing and scheduling

- `publish_post` — creates and queues a new post for immediate provider publishing
- `publish_draft` — queues an existing draft immediately
- `schedule_post` — creates a new future post
- `schedule_draft` — schedules an existing draft
- `cancel_scheduled_post` — cancels a future/pending post before provider publishing starts

### Status and analytics

- `list_posts`
- `get_post`
- `list_scheduled_posts`
- `get_analytics_summary`

Supported destinations are the same destinations AutoBrand supports in its normal social-account system:

- Facebook
- Instagram
- Google Business Profile
- LinkedIn
- Pinterest
- TikTok
- YouTube
- X
- Threads

A destination is publishable only when AutoBrand's existing readiness checks pass. MCP cannot bypass provider permissions, expired tokens, plan limits, workspace RBAC, approval rules or platform requirements.

## File/image workflow

`upload_media` uses ChatGPT's file parameter convention. ChatGPT supplies an object containing a temporary `download_url` and `file_id`. AutoBrand:

1. downloads the file through its SSRF-safe remote fetcher;
2. enforces the configured MCP upload-size limit and normal storage quota;
3. applies the requested/user-default storage destination;
4. persists through AutoBrand Cloudinary/GridFS, Google Drive, or both;
5. creates/updates the normal AutoBrand `Media` record;
6. returns a stable AutoBrand media ID plus Drive metadata when applicable.

Publishing tools then use `mediaIds`. Drive-only media is served to providers through AutoBrand's authenticated/unguessable media proxy rather than exposing the user's whole Drive. This is intentionally different from passing temporary Canva/CDN preview URLs directly to social providers.

## Tool security metadata

Every tool advertises an OAuth security scheme at both the standard `securitySchemes` field and the compatibility `_meta.securitySchemes` mirror.

The connector also publishes:

- `_meta["openai/profile"] = true` on `get_profile`;
- `_meta["openai/fileParams"] = ["file"]` on `upload_media`;
- tool invocation status strings;
- `outputSchema` for every tool;
- accurate `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations.

Immediate publishing tools are marked destructive because they can create real public external posts.

## Input validation

MCP arguments are validated server-side against the advertised JSON Schemas. The validator enforces:

- required fields;
- object/array/string/integer/boolean types;
- unknown-field rejection when `additionalProperties=false`;
- enums;
- item uniqueness;
- length/count limits;
- numeric bounds;
- URI, date, and timezone-aware ISO date-time formats;
- the nested ChatGPT file schema.

The model is never trusted as an authorization or validation boundary.

## OAuth 2.1 / MCP authorization

Scopes:

- `autobrand.read`
- `autobrand.write`
- `autobrand.publish`

The authorization server implements:

- authorization code + PKCE `S256`;
- protected-resource metadata;
- OAuth authorization-server metadata;
- the RFC 8707 `resource` parameter and access-token audience binding;
- RFC 9207 authorization-response issuer identification (`iss`);
- ChatGPT Client ID Metadata Documents (CIMD);
- dynamic client registration (DCR) for compatible clients;
- refresh-token rotation and replay-family revocation;
- token revocation;
- short-lived access tokens;
- per-user/per-client OAuth grants;
- user-controlled connection revocation in **Settings & Security**.

AutoBrand intentionally accepts public-client token exchange (`token_endpoint_auth_method=none`) for ChatGPT/Codex PKCE clients. CIMD metadata that does not advertise `none` is rejected rather than being treated as an authenticated client without verifying its assertion.

### OAuth discovery URLs

For a deployment at `https://autobrand.example.com`:

```text
GET https://autobrand.example.com/.well-known/oauth-protected-resource
GET https://autobrand.example.com/.well-known/oauth-protected-resource/mcp
GET https://autobrand.example.com/.well-known/oauth-authorization-server
GET https://autobrand.example.com/.well-known/openid-configuration
```

MCP endpoint:

```text
POST https://autobrand.example.com/mcp
```

OAuth endpoints:

```text
GET/POST https://autobrand.example.com/mcp/oauth/authorize
POST     https://autobrand.example.com/mcp/oauth/token
POST     https://autobrand.example.com/mcp/oauth/register
POST     https://autobrand.example.com/mcp/oauth/revoke
```

## Token lifecycle and revocation

Access tokens are JWTs signed with the dedicated `MCP_OAUTH_TOKEN_SECRET`, bound to:

- the AutoBrand OAuth issuer;
- the canonical MCP resource audience;
- the AutoBrand user;
- the MCP client ID;
- the approved scopes;
- the user's session token version;
- a unique `jti`.

A valid JWT is still rejected when its OAuth grant was revoked or the specific access-token `jti` is in the revocation store.

Refresh tokens are opaque, hashed at rest, rotated on every use, and grouped into token families. Reuse of an already rotated refresh token revokes the remaining active family.

Users can revoke an MCP client from AutoBrand **Settings & Security → ChatGPT & MCP connections**. Revocation disables the grant and active refresh tokens immediately. Existing access tokens are also rejected because every MCP request re-checks the active grant.

## RBAC and tenancy

Every brand-scoped tool runs AutoBrand's normal workspace authorization checks. Supplying another brand's ID in a tool argument never grants access.

The connector inherits the normal permissions including:

- `brand.view`
- `content.view`
- `content.create`
- `content.edit`
- `content.publish`
- `schedule.manage`
- `analytics.view`

The same plan/usage quota services used by the dashboard are enforced for MCP-created media and posts.

## Publishing behavior

MCP does not call provider APIs directly. `publish_post`, `publish_draft`, `schedule_post`, and `schedule_draft` persist normal `Post` records and dispatch through the existing durable publishing pipeline.

That means the connector automatically inherits:

- exact social-account destination resolution;
- readiness checks;
- BullMQ/Redis acceleration when configured;
- MongoDB fallback dispatch when Redis is unavailable;
- provider-specific media conversion/publishing;
- retries and permanent-error classification;
- delivery results and provider post URLs;
- analytics synchronization;
- existing audit logs.

## Idempotency

New MCP post creation uses an AutoBrand idempotency key. ChatGPT can provide `clientRequestId` for stable retry semantics. When absent, AutoBrand creates a deterministic short-window retry key to prevent accidental duplicate posts from transient tool retries.

## Environment variables

Production minimum:

```env
MCP_ENABLED=true
MCP_OAUTH_ISSUER=https://your-autobrand-domain.example
MCP_RESOURCE_URL=https://your-autobrand-domain.example/mcp
MCP_OAUTH_TOKEN_SECRET=<unique-random-32+-character-secret>
MCP_ACCESS_EXPIRES_IN=15m
MCP_REFRESH_EXPIRES_IN=30d
MCP_DYNAMIC_CLIENT_REGISTRATION_ENABLED=true
MCP_MAX_UPLOAD_BYTES=104857600
```

`MCP_OAUTH_TOKEN_SECRET` must be distinct from web JWT, cookie, CSRF, webhook and provider-token encryption secrets.

## Local testing

1. Start AutoBrand with MongoDB and `MCP_ENABLED=true`.
2. Run the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

3. Select **Streamable HTTP**.
4. Use:

```text
http://localhost:3200/mcp
```

5. Complete the OAuth flow with a development AutoBrand user.
6. Verify in this order:
   - `get_profile`
   - `list_brands`
   - `list_connected_accounts`
   - `upload_media`
   - `create_draft`
   - `publish_draft` against test social accounts
   - `get_post`
   - `get_analytics_summary`

Never test immediate publishing first against production social accounts.

## Connect to ChatGPT

After deployment to public HTTPS:

1. Open ChatGPT **Settings → Security and login** and enable **Developer mode**.
2. Open **Plugins** and choose the add/plus option.
3. Add the HTTPS MCP URL, for example:

```text
https://your-autobrand-domain.example/mcp
```

4. Name it **AutoBrand AI**.
5. Complete AutoBrand login and consent.
6. Start a new chat and select the AutoBrand AI plugin.

Recommended smoke prompts:

```text
List my AutoBrand brands.
Show connected social accounts for Classic Technologies.
Upload this image into Classic Technologies.
Create a Facebook and LinkedIn draft using that image.
Show me the draft before publishing.
Publish that draft now.
Show the delivery status.
Show Classic Technologies performance for the last 30 days.
```

## Public plugin submission later

Dogfood the private connector first. Before public submission, prepare:

- production logo;
- plugin description;
- company URL;
- privacy-policy URL;
- support URL;
- test prompts and expected outcomes;
- tool-review notes, especially for publishing tools;
- a production test account/workspace;
- screenshots only if a future MCP UI is added.

AutoBrand currently exposes tools only; custom MCP UI is optional and is not required for the connector to publish, schedule, inspect accounts or return analytics.

## Operational rule

Never expose raw social-provider access tokens, refresh tokens, encrypted provider credentials, MCP access/refresh tokens, private keys or deployment secrets in MCP tool results, logs, plugin UI, or prompts.


## Example operator prompts

- “Create an image for Classic Technologies, store it in both AutoBrand and my Google Drive, then create a draft for LinkedIn and Instagram.”
- “Schedule this Classic Trip video for tomorrow at 09:00 Africa/Kampala.”
- “Show my Instagram workspace performance for the last 30 days and suggest what to improve.”
- “Back up this media asset to Google Drive.”
- “List scheduled posts and cancel the one for Friday.”

The client may generate the image/video itself, then pass the resulting file through `upload_media`; AutoBrand does not require a separate paid AutoBrand AI generation to ingest that asset.

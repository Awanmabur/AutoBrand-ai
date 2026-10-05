const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('MCP connector is wired into app and OAuth metadata supports ChatGPT issuer identification', () => {
  const root = path.resolve(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const oauth = fs.readFileSync(path.join(root, 'src/services/mcp/mcpOAuth.service.js'), 'utf8');
  assert.match(app, /\.well-known\/oauth-protected-resource/);
  assert.match(app, /app\.use\('\/mcp', mcpRoutes\)/);
  assert.match(oauth, /authorization_response_iss_parameter_supported:\s*true/);
  assert.match(oauth, /client_id_metadata_document_supported:\s*true/);
});

test('MCP tool surface includes media, drafts, publishing, scheduling and analytics', () => {
  const { tools } = require('../src/services/mcp/mcpToolDefinitions');
  const names = new Set(tools.map((tool) => tool.name));
  for (const name of ['get_profile','list_brands','list_connected_accounts','upload_media','create_draft','update_draft','publish_post','publish_draft','schedule_post','schedule_draft','list_scheduled_posts','cancel_scheduled_post','get_analytics_summary']) assert.ok(names.has(name), name);
  const upload = tools.find((tool) => tool.name === 'upload_media');
  assert.deepEqual(upload._meta['openai/fileParams'], ['file']);
  assert.equal(tools.find((tool) => tool.name === 'publish_post').scope, 'autobrand.publish');
});

test('MCP public token endpoints are exempt from browser CSRF but authorization consent remains browser-protected', () => {
  const csrf = fs.readFileSync(path.resolve(__dirname, '../src/middlewares/csrfProtection.js'), 'utf8');
  assert.match(csrf, /mcp\\\/oauth/);
  assert.doesNotMatch(csrf, /mcp\\\/oauth\\\/(?:authorize)/);
});

test('MCP tool descriptors expose output schemas and mirrored OAuth metadata', () => {
  const { tools } = require('../src/services/mcp/mcpToolDefinitions');
  for (const tool of tools) {
    assert.ok(tool.outputSchema && tool.outputSchema.type === 'object', `${tool.name} outputSchema`);
    assert.ok(Array.isArray(tool.securitySchemes) && tool.securitySchemes.length, `${tool.name} securitySchemes`);
    assert.deepEqual(tool._meta.securitySchemes, tool.securitySchemes, `${tool.name} mirrored security schemes`);
    assert.equal(typeof tool._meta['openai/toolInvocation/invoking'], 'string', `${tool.name} invoking text`);
    assert.equal(typeof tool._meta['openai/toolInvocation/invoked'], 'string', `${tool.name} invoked text`);
  }
  const profile = tools.find((tool) => tool.name === 'get_profile');
  assert.equal(profile._meta['openai/profile'], true);
  assert.deepEqual(profile.outputSchema.required, ['id']);
  assert.equal(profile.outputSchema.additionalProperties, false);
  const publish = tools.find((tool) => tool.name === 'publish_post');
  assert.equal(publish.annotations.destructiveHint, true);
  assert.equal(publish.annotations.openWorldHint, true);
});

test('MCP OAuth connector supports grant revocation and refresh-token replay hardening', () => {
  const root = path.resolve(__dirname, '..');
  const oauth = fs.readFileSync(path.join(root, 'src/services/mcp/mcpOAuth.service.js'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'src/controllers/settingsController.js'), 'utf8');
  const accountDeletion = fs.readFileSync(path.join(root, 'src/services/account/accountDeletionProcessor.service.js'), 'utf8');
  assert.match(oauth, /McpOAuthGrant/);
  assert.match(oauth, /already been rotated/);
  assert.match(oauth, /revokeUserAuthorization/);
  assert.match(settings, /revokeMcpAuthorization/);
  assert.match(accountDeletion, /McpOAuthGrant\.deleteMany/);
  assert.match(accountDeletion, /McpRefreshToken\.deleteMany/);
});

test('MCP invalid bearer tokens return an HTTP OAuth challenge instead of falling through', () => {
  const auth = fs.readFileSync(path.resolve(__dirname, '../src/middlewares/mcpAuth.js'), 'utf8');
  assert.match(auth, /status\(401\)/);
  assert.match(auth, /WWW-Authenticate/);
  assert.match(auth, /invalid_token/);
  assert.match(auth, /oauth-protected-resource/);
});

test('MCP release documentation is part of the production release gate', () => {
  const releaseCheck = fs.readFileSync(path.resolve(__dirname, '../scripts/releaseCheck.js'), 'utf8');
  const checklist = fs.readFileSync(path.resolve(__dirname, '../docs/PRODUCTION-CHECKLIST.md'), 'utf8');
  assert.match(releaseCheck, /docs\/MCP-CONNECTOR\.md/);
  assert.match(checklist, /ChatGPT \/ MCP connector/);
});

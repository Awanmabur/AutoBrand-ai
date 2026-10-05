const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');
const env = require('../../config/env');
const User = require('../../models/User');
const McpOAuthClient = require('../../models/McpOAuthClient');
const McpOAuthGrant = require('../../models/McpOAuthGrant');
const McpAuthorizationCode = require('../../models/McpAuthorizationCode');
const McpRefreshToken = require('../../models/McpRefreshToken');
const McpRevokedAccessToken = require('../../models/McpRevokedAccessToken');
const { downloadRemoteBuffer } = require('../remoteFetch.service');
const { verifyMcpAccessToken } = require('../tokenService');

const SUPPORTED_SCOPES = Object.freeze(['autobrand.read', 'autobrand.write', 'autobrand.publish']);
const SCOPE_DESCRIPTIONS = Object.freeze({
  'autobrand.read': 'View AutoBrand brands, connected social accounts, media, posts and analytics.',
  'autobrand.write': 'Upload media and create or edit AutoBrand drafts.',
  'autobrand.publish': 'Publish, schedule or cancel content on connected social accounts.'
});

function issuer() {
  return String(env.mcpOAuthIssuer || env.appUrl).replace(/\/+$/, '');
}

function resource() {
  return String(env.mcpResourceUrl || `${issuer()}/mcp`).replace(/\/+$/, '');
}

function hashOpaque(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function randomOpaque(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function normalizeScopes(value, { requireAny = true } = {}) {
  const requested = [...new Set((Array.isArray(value) ? value : String(value || '').split(/\s+/))
    .map((item) => String(item || '').trim())
    .filter(Boolean))];
  const unknown = requested.filter((scope) => !SUPPORTED_SCOPES.includes(scope));
  if (unknown.length) {
    const error = new Error(`Unsupported OAuth scope: ${unknown.join(', ')}`);
    error.oauthError = 'invalid_scope';
    throw error;
  }
  if (requireAny && !requested.length) return ['autobrand.read'];
  return requested;
}

function scopeString(scopes = []) {
  return normalizeScopes(scopes).join(' ');
}

function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(String(verifier || '')).digest('base64url');
}

function safeRedirectUri(value) {
  let parsed;
  try { parsed = new URL(String(value || '')); }
  catch (_error) { return ''; }
  if (parsed.hash) return '';
  if (parsed.protocol === 'https:') return parsed.toString();
  const localhost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname);
  if (parsed.protocol === 'http:' && localhost) return parsed.toString();
  return '';
}

function validateRegisteredRedirectUris(values) {
  const uris = [...new Set((Array.isArray(values) ? values : []).map(safeRedirectUri).filter(Boolean))];
  if (!uris.length) {
    const error = new Error('At least one HTTPS redirect_uri is required. Localhost HTTP is allowed only for development tools.');
    error.oauthError = 'invalid_client_metadata';
    throw error;
  }
  if (uris.length > 20) {
    const error = new Error('Too many redirect URIs.');
    error.oauthError = 'invalid_client_metadata';
    throw error;
  }
  return uris;
}

async function registerClient(metadata = {}) {
  if (!env.mcpDynamicClientRegistrationEnabled) {
    const error = new Error('Dynamic client registration is disabled.');
    error.oauthError = 'invalid_client_metadata';
    throw error;
  }
  const redirectUris = validateRegisteredRedirectUris(metadata.redirect_uris);
  const tokenEndpointAuthMethod = String(metadata.token_endpoint_auth_method || 'none');
  if (tokenEndpointAuthMethod !== 'none') {
    const error = new Error('AutoBrand MCP supports public PKCE clients with token_endpoint_auth_method=none.');
    error.oauthError = 'invalid_client_metadata';
    throw error;
  }
  const grantTypes = Array.isArray(metadata.grant_types) && metadata.grant_types.length
    ? metadata.grant_types.map(String)
    : ['authorization_code', 'refresh_token'];
  if (grantTypes.some((item) => !['authorization_code', 'refresh_token'].includes(item))) {
    const error = new Error('Unsupported OAuth grant type in client registration.');
    error.oauthError = 'invalid_client_metadata';
    throw error;
  }
  const responseTypes = Array.isArray(metadata.response_types) && metadata.response_types.length
    ? metadata.response_types.map(String)
    : ['code'];
  if (responseTypes.some((item) => item !== 'code')) {
    const error = new Error('Only the authorization-code response type is supported.');
    error.oauthError = 'invalid_client_metadata';
    throw error;
  }

  const client = await McpOAuthClient.create({
    clientId: `mcp_${randomOpaque(24)}`,
    clientName: String(metadata.client_name || 'MCP client').slice(0, 200),
    redirectUris,
    grantTypes,
    responseTypes,
    tokenEndpointAuthMethod: 'none',
    source: 'dynamic',
    metadata: {
      clientUri: safeRedirectUri(metadata.client_uri) || '',
      logoUri: safeRedirectUri(metadata.logo_uri) || ''
    }
  });
  return client;
}

async function loadCimdClient(clientId) {
  let url;
  try { url = new URL(String(clientId || '')); }
  catch (_error) { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com' || !/^\/oauth\/.+client\.json$|^\/oauth\/client\.json$/.test(url.pathname)) return null;
  const downloaded = await downloadRemoteBuffer(url.toString(), { maxBytes: 256 * 1024 });
  const metadata = JSON.parse(downloaded.buffer.toString('utf8'));
  const redirectUris = validateRegisteredRedirectUris(metadata.redirect_uris);
  if (metadata.client_id && metadata.client_id !== clientId) throw new Error('CIMD client_id does not match its metadata URL.');
  const advertisedMethods = Array.isArray(metadata.token_endpoint_auth_methods_supported)
    ? metadata.token_endpoint_auth_methods_supported.map(String)
    : [String(metadata.token_endpoint_auth_method || 'none')];
  if (!advertisedMethods.includes('none')) {
    throw new Error('This AutoBrand authorization server requires ChatGPT CIMD clients that support public token exchange with token_endpoint_auth_method=none.');
  }
  const grantTypes = Array.isArray(metadata.grant_types) && metadata.grant_types.length ? metadata.grant_types.map(String) : ['authorization_code', 'refresh_token'];
  if (grantTypes.some((item) => !['authorization_code', 'refresh_token'].includes(item))) throw new Error('Unsupported CIMD grant type.');
  const responseTypes = Array.isArray(metadata.response_types) && metadata.response_types.length ? metadata.response_types.map(String) : ['code'];
  if (responseTypes.some((item) => item !== 'code')) throw new Error('Unsupported CIMD response type.');
  return {
    clientId,
    clientName: String(metadata.client_name || 'ChatGPT').slice(0, 200),
    redirectUris,
    grantTypes,
    responseTypes,
    tokenEndpointAuthMethod: 'none',
    source: 'cimd',
    metadata
  };
}

async function resolveClient(clientId) {
  const id = String(clientId || '').trim();
  if (!id) return null;
  const stored = await McpOAuthClient.findOne({ clientId: id });
  if (stored) return stored;
  return loadCimdClient(id);
}

function exactRedirectAllowed(client, redirectUri) {
  const normalized = safeRedirectUri(redirectUri);
  return Boolean(normalized && (client?.redirectUris || []).includes(normalized));
}

async function validateAuthorizationRequest(input = {}) {
  if (String(input.response_type || '') !== 'code') {
    const error = new Error('Only response_type=code is supported.');
    error.oauthError = 'unsupported_response_type';
    throw error;
  }
  const client = await resolveClient(input.client_id);
  if (!client) {
    const error = new Error('Unknown OAuth client.');
    error.oauthError = 'unauthorized_client';
    throw error;
  }
  if (!exactRedirectAllowed(client, input.redirect_uri)) {
    const error = new Error('redirect_uri does not match the registered OAuth client.');
    error.oauthError = 'invalid_request';
    throw error;
  }
  if (String(input.code_challenge_method || '') !== 'S256' || !String(input.code_challenge || '').trim()) {
    const error = new Error('PKCE with code_challenge_method=S256 is required.');
    error.oauthError = 'invalid_request';
    throw error;
  }
  const requestedResource = String(input.resource || resource()).replace(/\/+$/, '');
  if (requestedResource !== resource()) {
    const error = new Error('The OAuth resource does not match this AutoBrand MCP server.');
    error.oauthError = 'invalid_target';
    throw error;
  }
  const scopes = normalizeScopes(input.scope);
  return {
    client,
    clientId: String(client.clientId),
    clientName: String(client.clientName || 'MCP client'),
    redirectUri: safeRedirectUri(input.redirect_uri),
    scopes,
    state: String(input.state || ''),
    codeChallenge: String(input.code_challenge),
    codeChallengeMethod: 'S256',
    resource: requestedResource
  };
}

async function createAuthorizationCode({ user, authorization }) {
  const code = randomOpaque(48);
  await McpAuthorizationCode.create({
    codeHash: hashOpaque(code),
    user: user._id,
    clientId: authorization.clientId,
    redirectUri: authorization.redirectUri,
    scopes: authorization.scopes,
    resource: authorization.resource,
    codeChallenge: authorization.codeChallenge,
    codeChallengeMethod: 'S256',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  });
  if (authorization.client?._id) {
    await McpOAuthClient.updateOne({ _id: authorization.client._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  }
  await McpOAuthGrant.updateOne(
    { user: user._id, clientId: authorization.clientId },
    {
      $set: {
        scopes: authorization.scopes,
        authorizedAt: new Date(),
        lastUsedAt: new Date()
      },
      $unset: { revokedAt: 1 }
    },
    { upsert: true }
  );
  return code;
}

function signAccessToken(user, { clientId, scopes, tokenResource }) {
  return jwt.sign(
    {
      sub: String(user._id),
      type: 'mcp_access',
      client_id: String(clientId),
      scope: normalizeScopes(scopes).join(' '),
      ver: Number(user.tokenVersion || 0),
      jti: crypto.randomUUID()
    },
    env.mcpOAuthTokenSecret,
    {
      algorithm: 'HS256',
      issuer: issuer(),
      audience: tokenResource || resource(),
      expiresIn: env.mcpAccessExpiresIn
    }
  );
}

async function createRefreshToken(user, { clientId, scopes, tokenResource, familyId = crypto.randomUUID() }) {
  const token = randomOpaque(64);
  const expiresAt = new Date(Date.now() + env.mcpRefreshMaxAgeMs);
  await McpRefreshToken.create({
    tokenHash: hashOpaque(token),
    user: user._id,
    clientId,
    scopes: normalizeScopes(scopes),
    resource: tokenResource || resource(),
    familyId,
    expiresAt
  });
  return { token, expiresAt, familyId };
}

function accessExpiresSeconds() {
  return Math.max(60, Math.floor(env.mcpAccessMaxAgeMs / 1000));
}

async function tokenPair(user, { clientId, scopes, tokenResource, familyId }) {
  const grant = await McpOAuthGrant.findOne({ user: user._id, clientId: String(clientId || ''), revokedAt: { $exists: false } });
  if (!grant) {
    const error = new Error('The AutoBrand MCP authorization has been revoked. Reconnect to continue.');
    error.oauthError = 'invalid_grant';
    throw error;
  }
  const normalizedScopes = normalizeScopes(scopes);
  if (normalizedScopes.some((scope) => !grant.scopes.includes(scope))) {
    const error = new Error('Requested scopes exceed the active AutoBrand MCP grant.');
    error.oauthError = 'invalid_scope';
    throw error;
  }
  grant.lastUsedAt = new Date();
  await grant.save();
  const refresh = await createRefreshToken(user, { clientId, scopes: normalizedScopes, tokenResource, familyId });
  return {
    access_token: signAccessToken(user, { clientId, scopes: normalizedScopes, tokenResource }),
    token_type: 'Bearer',
    expires_in: accessExpiresSeconds(),
    refresh_token: refresh.token,
    scope: normalizedScopes.join(' ')
  };
}

async function exchangeAuthorizationCode({ code, clientId, redirectUri, codeVerifier, requestedResource }) {
  const now = new Date();
  const record = await McpAuthorizationCode.findOne({
    codeHash: hashOpaque(code),
    usedAt: { $exists: false },
    expiresAt: { $gt: now }
  });
  if (!record) {
    const error = new Error('Authorization code is invalid, expired, or already used.');
    error.oauthError = 'invalid_grant';
    throw error;
  }
  if (record.clientId !== String(clientId || '')) {
    const error = new Error('Authorization code was issued to another client.');
    error.oauthError = 'invalid_grant';
    throw error;
  }
  if (safeRedirectUri(redirectUri) !== record.redirectUri) {
    const error = new Error('redirect_uri does not match the authorization request.');
    error.oauthError = 'invalid_grant';
    throw error;
  }
  if (!codeVerifier || pkceChallenge(codeVerifier) !== record.codeChallenge) {
    const error = new Error('PKCE verification failed.');
    error.oauthError = 'invalid_grant';
    throw error;
  }
  const tokenResource = String(requestedResource || record.resource).replace(/\/+$/, '');
  if (tokenResource !== record.resource || tokenResource !== resource()) {
    const error = new Error('OAuth resource mismatch.');
    error.oauthError = 'invalid_target';
    throw error;
  }

  const consumed = await McpAuthorizationCode.findOneAndUpdate(
    { _id: record._id, usedAt: { $exists: false }, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true }
  );
  if (!consumed) {
    const error = new Error('Authorization code has already been used.');
    error.oauthError = 'invalid_grant';
    throw error;
  }

  const user = await User.findOne({ _id: record.user, status: 'active' });
  if (!user) {
    const error = new Error('The AutoBrand user is no longer active.');
    error.oauthError = 'invalid_grant';
    throw error;
  }
  return tokenPair(user, { clientId: record.clientId, scopes: record.scopes, tokenResource });
}

async function rotateRefreshToken({ refreshToken, clientId, requestedResource, requestedScope }) {
  const now = new Date();
  const tokenHash = hashOpaque(refreshToken);
  const record = await McpRefreshToken.findOneAndUpdate(
    {
      tokenHash,
      clientId: String(clientId || ''),
      revokedAt: { $exists: false },
      expiresAt: { $gt: now }
    },
    { $set: { revokedAt: now, rotatedAt: now } },
    { new: false }
  );
  if (!record) {
    const replay = await McpRefreshToken.findOne({ tokenHash, clientId: String(clientId || '') }).lean();
    if (replay?.familyId && replay.revokedAt) {
      await McpRefreshToken.updateMany(
        { familyId: replay.familyId, revokedAt: { $exists: false } },
        { $set: { revokedAt: now } }
      ).catch(() => {});
    }
    const error = new Error('Refresh token is invalid, expired, revoked, or has already been rotated.');
    error.oauthError = 'invalid_grant';
    throw error;
  }
  const tokenResource = String(requestedResource || record.resource).replace(/\/+$/, '');
  if (tokenResource !== record.resource || tokenResource !== resource()) {
    const error = new Error('OAuth resource mismatch.');
    error.oauthError = 'invalid_target';
    throw error;
  }
  const requested = requestedScope ? normalizeScopes(requestedScope) : record.scopes;
  if (requested.some((scope) => !record.scopes.includes(scope))) {
    const error = new Error('Refresh token cannot be expanded to additional scopes.');
    error.oauthError = 'invalid_scope';
    throw error;
  }
  const user = await User.findOne({ _id: record.user, status: 'active' });
  if (!user) {
    const error = new Error('The AutoBrand user is no longer active.');
    error.oauthError = 'invalid_grant';
    throw error;
  }
  return tokenPair(user, {
    clientId: record.clientId,
    scopes: requested,
    tokenResource,
    familyId: record.familyId
  });
}

async function revokeToken({ token, clientId }) {
  if (!token) return;
  const raw = String(token);

  try {
    const payload = verifyMcpAccessToken(raw, { issuer: issuer(), audience: resource() });
    if (payload?.jti && payload?.exp) {
      await McpRevokedAccessToken.updateOne(
        { jti: String(payload.jti) },
        {
          $setOnInsert: {
            jti: String(payload.jti),
            user: payload.sub,
            clientId: String(payload.client_id || clientId || ''),
            expiresAt: new Date(Number(payload.exp) * 1000),
            reason: 'oauth_revocation'
          }
        },
        { upsert: true }
      ).catch(() => {});
      return;
    }
  } catch (_error) {
    // OAuth revocation is intentionally non-disclosing. Fall through and try
    // the opaque refresh-token store; invalid tokens still return HTTP 200.
  }

  await McpRefreshToken.updateOne(
    { tokenHash: hashOpaque(raw), ...(clientId ? { clientId: String(clientId) } : {}) },
    { $set: { revokedAt: new Date() } }
  ).catch(() => {});
}

async function verifyAccessToken(token) {
  const payload = verifyMcpAccessToken(String(token || ''), {
    issuer: issuer(),
    audience: resource()
  });
  if (!payload.sub || !payload.jti) throw new Error('Expected an AutoBrand MCP access token with subject and jti.');
  if (await McpRevokedAccessToken.exists({ jti: String(payload.jti) })) throw new Error('AutoBrand MCP access token was revoked.');
  const user = await User.findOne({ _id: payload.sub, status: 'active' }).select('-passwordHash');
  if (!user) throw new Error('AutoBrand account is unavailable.');
  if (Number(payload.ver || 0) !== Number(user.tokenVersion || 0)) throw new Error('AutoBrand session was revoked.');
  const grant = await McpOAuthGrant.findOne({ user: user._id, clientId: String(payload.client_id || ''), revokedAt: { $exists: false } }).lean();
  if (!grant) throw new Error('AutoBrand MCP authorization was revoked.');
  const scopes = normalizeScopes(payload.scope, { requireAny: false });
  if (!scopes.length) throw new Error('AutoBrand MCP access token has no authorized scopes.');
  if (scopes.some((scope) => !grant.scopes.includes(scope))) throw new Error('AutoBrand MCP token scopes exceed the active authorization grant.');
  return {
    token: String(token),
    user,
    userId: String(user._id),
    clientId: String(payload.client_id || ''),
    scopes,
    expiresAt: payload.exp ? Number(payload.exp) : undefined
  };
}

async function listUserAuthorizations(user) {
  const grants = await McpOAuthGrant.find({ user: user._id }).sort({ updatedAt: -1 }).lean();
  const storedClients = await McpOAuthClient.find({ clientId: { $in: grants.map((grant) => grant.clientId) } }).lean();
  const clientMap = new Map(storedClients.map((client) => [client.clientId, client]));
  const now = new Date();
  const refreshCounts = await McpRefreshToken.aggregate([
    { $match: { user: user._id, revokedAt: { $exists: false }, expiresAt: { $gt: now } } },
    { $group: { _id: '$clientId', activeRefreshTokens: { $sum: 1 }, latestExpiry: { $max: '$expiresAt' } } }
  ]).catch(() => []);
  const refreshMap = new Map(refreshCounts.map((row) => [String(row._id), row]));
  return grants.map((grant) => {
    const stored = clientMap.get(grant.clientId);
    let clientName = stored?.clientName || '';
    if (!clientName) {
      try { if (new URL(grant.clientId).hostname === 'chatgpt.com') clientName = 'ChatGPT'; }
      catch (_error) {}
    }
    return {
      clientId: grant.clientId,
      clientName: clientName || 'MCP client',
      scopes: grant.scopes || [],
      authorizedAt: grant.authorizedAt,
      lastUsedAt: grant.lastUsedAt || grant.updatedAt,
      revokedAt: grant.revokedAt || null,
      active: !grant.revokedAt,
      activeRefreshTokens: refreshMap.get(grant.clientId)?.activeRefreshTokens || 0,
      latestRefreshExpiry: refreshMap.get(grant.clientId)?.latestExpiry || null
    };
  });
}

async function revokeUserAuthorization(user, clientId) {
  const id = String(clientId || '').trim();
  if (!id) throw new Error('clientId is required.');
  const now = new Date();
  const grant = await McpOAuthGrant.findOneAndUpdate(
    { user: user._id, clientId: id, revokedAt: { $exists: false } },
    { $set: { revokedAt: now } },
    { new: true }
  );
  await McpRefreshToken.updateMany(
    { user: user._id, clientId: id, revokedAt: { $exists: false } },
    { $set: { revokedAt: now } }
  );
  return Boolean(grant);
}

function protectedResourceMetadata() {
  return {
    resource: resource(),
    authorization_servers: [issuer()],
    scopes_supported: SUPPORTED_SCOPES,
    resource_documentation: `${issuer()}/docs/mcp`
  };
}

function authorizationServerMetadata() {
  return {
    issuer: issuer(),
    authorization_endpoint: `${issuer()}/mcp/oauth/authorize`,
    token_endpoint: `${issuer()}/mcp/oauth/token`,
    registration_endpoint: `${issuer()}/mcp/oauth/register`,
    revocation_endpoint: `${issuer()}/mcp/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: SUPPORTED_SCOPES,
    service_documentation: `${issuer()}/docs/mcp`,
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true
  };
}

function clientRegistrationResponse(client) {
  return {
    client_id: String(client.clientId),
    client_name: String(client.clientName || 'MCP client'),
    redirect_uris: client.redirectUris || [],
    grant_types: client.grantTypes || ['authorization_code', 'refresh_token'],
    response_types: client.responseTypes || ['code'],
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(new Date(client.createdAt || Date.now()).getTime() / 1000)
  };
}

function oauthErrorResponse(error, fallback = 'invalid_request') {
  return {
    error: error?.oauthError || fallback,
    error_description: String(error?.message || 'OAuth request failed.').slice(0, 500)
  };
}

module.exports = {
  SCOPE_DESCRIPTIONS,
  SUPPORTED_SCOPES,
  authorizationServerMetadata,
  clientRegistrationResponse,
  createAuthorizationCode,
  exchangeAuthorizationCode,
  issuer,
  listUserAuthorizations,
  normalizeScopes,
  oauthErrorResponse,
  pkceChallenge,
  protectedResourceMetadata,
  registerClient,
  resource,
  resolveClient,
  revokeToken,
  revokeUserAuthorization,
  rotateRefreshToken,
  safeRedirectUri,
  scopeString,
  validateAuthorizationRequest,
  verifyAccessToken
};

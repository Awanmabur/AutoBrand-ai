const AuditLog = require('../../models/AuditLog');
const { assertPlanFeature } = require('../../services/usageLimitService');
const {
  SCOPE_DESCRIPTIONS,
  authorizationServerMetadata,
  clientRegistrationResponse,
  createAuthorizationCode,
  exchangeAuthorizationCode,
  oauthErrorResponse,
  protectedResourceMetadata,
  registerClient,
  revokeToken,
  rotateRefreshToken,
  issuer,
  validateAuthorizationRequest
} = require('../../services/mcp/mcpOAuth.service');

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

function appendRedirect(redirectUri, params) {
  const target = new URL(redirectUri);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') target.searchParams.set(key, String(value));
  });
  return target.toString();
}

function protectedResource(req, res) {
  noStore(res);
  return res.json(protectedResourceMetadata());
}

function authorizationServer(req, res) {
  noStore(res);
  return res.json(authorizationServerMetadata());
}

async function register(req, res) {
  noStore(res);
  try {
    const client = await registerClient(req.body || {});
    return res.status(201).json(clientRegistrationResponse(client));
  } catch (error) {
    return res.status(400).json(oauthErrorResponse(error, 'invalid_client_metadata'));
  }
}

async function token(req, res) {
  noStore(res);
  try {
    const grantType = String(req.body.grant_type || '');
    const clientId = String(req.body.client_id || '');
    if (!clientId) return res.status(400).json({ error: 'invalid_client', error_description: 'client_id is required.' });

    let result;
    if (grantType === 'authorization_code') {
      result = await exchangeAuthorizationCode({
        code: req.body.code,
        clientId,
        redirectUri: req.body.redirect_uri,
        codeVerifier: req.body.code_verifier,
        requestedResource: req.body.resource
      });
    } else if (grantType === 'refresh_token') {
      result = await rotateRefreshToken({
        refreshToken: req.body.refresh_token,
        clientId,
        requestedResource: req.body.resource,
        requestedScope: req.body.scope
      });
    } else {
      return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Use authorization_code or refresh_token.' });
    }
    return res.json(result);
  } catch (error) {
    return res.status(400).json(oauthErrorResponse(error, 'invalid_grant'));
  }
}

async function revoke(req, res) {
  noStore(res);
  await revokeToken({ token: req.body.token, clientId: req.body.client_id });
  return res.status(200).end();
}

async function authorize(req, res, next) {
  try {
    const authorization = await validateAuthorizationRequest(req.query);
    if (!req.user) {
      const nextPath = req.originalUrl.startsWith('/') ? req.originalUrl : '/mcp/oauth/authorize';
      return res.redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
    }
    await assertPlanFeature(req.user, 'chatgptConnectorAccess', 'ChatGPT/Codex connector access');
    noStore(res);
    return res.render('mcp/authorize', {
      title: 'Connect AutoBrand AI',
      layout: 'layouts/auth',
      authorization,
      scopeDescriptions: SCOPE_DESCRIPTIONS,
      error: null
    });
  } catch (error) {
    return next(error);
  }
}

async function confirm(req, res, next) {
  try {
    const authorization = await validateAuthorizationRequest({
      response_type: req.body.response_type,
      client_id: req.body.client_id,
      redirect_uri: req.body.redirect_uri,
      scope: req.body.scope,
      state: req.body.state,
      code_challenge: req.body.code_challenge,
      code_challenge_method: req.body.code_challenge_method,
      resource: req.body.resource
    });
    if (!req.user) return res.redirect(`/auth/login?next=${encodeURIComponent(req.originalUrl)}`);
    await assertPlanFeature(req.user, 'chatgptConnectorAccess', 'ChatGPT/Codex connector access');

    if (req.body.decision !== 'approve') {
      return res.redirect(appendRedirect(authorization.redirectUri, {
        error: 'access_denied',
        error_description: 'The user declined AutoBrand AI access.',
        state: authorization.state,
        iss: issuer()
      }));
    }

    const code = await createAuthorizationCode({ user: req.user, authorization });
    await AuditLog.create({
      user: req.user._id,
      action: 'mcp.oauth.authorized',
      entityType: 'User',
      entityId: req.user._id,
      ipAddress: String(req.ip || '').slice(0, 100),
      userAgent: String(req.get('user-agent') || '').slice(0, 500),
      metadata: { clientId: authorization.clientId, scopes: authorization.scopes }
    }).catch(() => {});

    return res.redirect(appendRedirect(authorization.redirectUri, {
      code,
      state: authorization.state,
      iss: issuer()
    }));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  authorize,
  authorizationServer,
  confirm,
  protectedResource,
  register,
  revoke,
  token
};

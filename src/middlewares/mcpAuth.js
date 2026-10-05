const { verifyAccessToken, resource } = require('../services/mcp/mcpOAuth.service');

function bearerToken(req) {
  const header = String(req.get('authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function resourceMetadataUrl() {
  try {
    const target = new URL(resource());
    const suffix = target.pathname && target.pathname !== '/'
      ? target.pathname.replace(/\/+$/, '')
      : '';
    return `${target.origin}/.well-known/oauth-protected-resource${suffix}`;
  } catch (_error) {
    return '/.well-known/oauth-protected-resource/mcp';
  }
}

function challenge(scope = '', extras = {}) {
  const parts = [`Bearer resource_metadata="${resourceMetadataUrl()}"`];
  if (scope) parts.push(`scope="${String(scope).replace(/"/g, '')}"`);
  if (extras.error) parts.push(`error="${String(extras.error).replace(/"/g, "'")}"`);
  if (extras.errorDescription) parts.push(`error_description="${String(extras.errorDescription).replace(/"/g, "'").slice(0, 300)}"`);
  return parts.join(', ');
}

async function attachMcpAuth(req, res, next) {
  const token = bearerToken(req);
  req.mcpAuth = null;
  req.mcpAuthError = null;
  if (!token) return next();

  try {
    req.mcpAuth = await verifyAccessToken(token);
    return next();
  } catch (error) {
    req.mcpAuthError = error;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('WWW-Authenticate', challenge('', {
      error: 'invalid_token',
      errorDescription: 'The AutoBrand access token is invalid or expired. Reconnect the AutoBrand AI plugin.'
    }));
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'The AutoBrand access token is invalid or expired. Reconnect the AutoBrand AI plugin.'
    });
  }
}

function hasScope(req, scope) {
  return Boolean(req.mcpAuth && Array.isArray(req.mcpAuth.scopes) && req.mcpAuth.scopes.includes(scope));
}

module.exports = { attachMcpAuth, bearerToken, challenge, hasScope, resourceMetadataUrl };

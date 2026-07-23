const User = require('../models/User');
const { verifyAccessToken } = require('../services/tokenService');

function bearerToken(req) {
  const header = String(req.get('authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function attachUser(req, res, next) {
  try {
    const token = req.cookies?.accessToken || bearerToken(req);
    if (!token) return next();

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('-passwordHash');

    if (
      user
      && user.status === 'active'
      && Number(payload.ver || 0) === Number(user.tokenVersion || 0)
    ) {
      req.user = user;
      req.auth = { tokenType: 'access', jti: payload.jti, issuedAt: payload.iat };
    }

    return next();
  } catch (_error) {
    return next();
  }
}

module.exports = attachUser;

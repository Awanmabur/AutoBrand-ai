const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const JWT_OPTIONS = {
  algorithm: 'HS256',
  issuer: env.jwtIssuer,
  audience: env.jwtAudience
};

function userTokenVersion(user) {
  return Number(user?.tokenVersion || 0);
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      plan: user.plan,
      ver: userTokenVersion(user),
      type: 'access',
      jti: crypto.randomUUID()
    },
    env.jwtAccessSecret,
    { ...JWT_OPTIONS, expiresIn: env.jwtAccessExpiresIn }
  );
}

function signRefreshToken(user, familyId = crypto.randomUUID()) {
  return {
    token: jwt.sign(
      {
        sub: user._id.toString(),
        familyId,
        ver: userTokenVersion(user),
        type: 'refresh',
        jti: crypto.randomUUID()
      },
      env.jwtRefreshSecret,
      { ...JWT_OPTIONS, expiresIn: env.jwtRefreshExpiresIn }
    ),
    familyId
  };
}

function verifyTypedToken(token, secret, type) {
  const payload = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
    clockTolerance: 5
  });
  if (payload.type !== type) throw new jwt.JsonWebTokenError(`Expected ${type} token.`);
  return payload;
}

function verifyAccessToken(token) {
  return verifyTypedToken(token, env.jwtAccessSecret, 'access');
}

function verifyRefreshToken(token) {
  return verifyTypedToken(token, env.jwtRefreshSecret, 'refresh');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken
};

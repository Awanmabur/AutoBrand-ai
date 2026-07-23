const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const env = require('../config/env');
const { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } = require('./tokenService');

function refreshExpiryDate() {
  return new Date(Date.now() + env.jwtRefreshMaxAgeMs);
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    path: '/',
    maxAge,
    priority: 'high'
  };
}

async function enforceSessionLimit(userId) {
  const active = await RefreshToken.find({ user: userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .select('_id')
    .lean();
  const overflow = active.slice(env.sessionMaxActive);
  if (overflow.length) {
    await RefreshToken.updateMany({ _id: { $in: overflow.map((item) => item._id) } }, { $set: { revokedAt: new Date(), revokeReason: 'session_limit' } });
  }
}

async function createStoredRefreshToken({ user, refresh, req }) {
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refresh.token),
    familyId: refresh.familyId,
    userAgent: String(req.get('user-agent') || '').slice(0, 500),
    ipAddress: String(req.ip || '').slice(0, 100),
    expiresAt: refreshExpiryDate()
  });
}

async function issueAuthTokens(user, req) {
  const accessToken = signAccessToken(user);
  const refresh = signRefreshToken(user);
  await createStoredRefreshToken({ user, refresh, req });
  await enforceSessionLimit(user._id);
  return { accessToken, refreshToken: refresh.token, user };
}

async function revokeTokenFamily(userId, familyId, reason = 'reuse_detected') {
  await RefreshToken.updateMany(
    { user: userId, familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: reason } }
  );
}

async function revokeAllSessions(userId, reason = 'security_event', { incrementVersion = false } = {}) {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: reason } }
  );
  if (incrementVersion) await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}

async function rotateRefreshToken(refreshToken, req) {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);
  const user = await User.findById(payload.sub);

  if (!user || user.status !== 'active' || Number(payload.ver || 0) !== Number(user.tokenVersion || 0)) {
    if (payload.sub && payload.familyId) await revokeTokenFamily(payload.sub, payload.familyId, 'invalid_account_or_version').catch(() => {});
    throw new Error('Invalid refresh token.');
  }

  const nextRefresh = signRefreshToken(user, payload.familyId);
  const now = new Date();
  const claimed = await RefreshToken.findOneAndUpdate(
    {
      tokenHash,
      user: user._id,
      familyId: payload.familyId,
      revokedAt: null,
      expiresAt: { $gt: now }
    },
    {
      $set: {
        revokedAt: now,
        replacedByToken: hashToken(nextRefresh.token),
        revokeReason: 'rotated'
      }
    },
    { new: false }
  );

  if (!claimed) {
    await revokeTokenFamily(user._id, payload.familyId, 'reuse_detected');
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    await user.save();
    throw new Error('Refresh token reuse detected.');
  }

  await createStoredRefreshToken({ user, refresh: nextRefresh, req });
  return { accessToken: signAccessToken(user), refreshToken: nextRefresh.token, user };
}

function setAuthCookies(res, tokens) {
  res.cookie('accessToken', tokens.accessToken, cookieOptions(env.jwtAccessMaxAgeMs));
  res.cookie('refreshToken', tokens.refreshToken, cookieOptions(env.jwtRefreshMaxAgeMs));
}

function clearAuthCookies(res) {
  const options = { path: '/', sameSite: 'lax', secure: env.nodeEnv === 'production' };
  res.clearCookie('accessToken', options);
  res.clearCookie('refreshToken', options);
}

function getRefreshTokenFromRequest(req) {
  return req.cookies?.refreshToken || '';
}

module.exports = {
  issueAuthTokens,
  rotateRefreshToken,
  revokeTokenFamily,
  revokeAllSessions,
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromRequest
};

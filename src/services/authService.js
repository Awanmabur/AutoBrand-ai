const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } = require('./tokenService');

function refreshExpiryDate() {
  const date = new Date();
  date.setHours(date.getHours() + 5);
  return date;
}

async function issueAuthTokens(user, req) {
  const accessToken = signAccessToken(user);
  const refresh = signRefreshToken(user);

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refresh.token),
    familyId: refresh.familyId,
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
    expiresAt: refreshExpiryDate()
  });

  return { accessToken, refreshToken: refresh.token };
}

async function rotateRefreshToken(refreshToken, req) {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);
  const stored = await RefreshToken.findOne({ tokenHash, user: payload.sub });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new Error('Invalid refresh token.');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.status === 'suspended') {
    throw new Error('Invalid refresh token.');
  }

  const nextRefresh = signRefreshToken(user, stored.familyId);
  stored.revokedAt = new Date();
  stored.replacedByToken = hashToken(nextRefresh.token);
  await stored.save();

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(nextRefresh.token),
    familyId: stored.familyId,
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
    expiresAt: refreshExpiryDate()
  });

  return { accessToken: signAccessToken(user), refreshToken: nextRefresh.token, user };
}

function setAuthCookies(res, tokens) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 5 * 60 * 60 * 1000
  });
  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 5 * 60 * 60 * 1000
  });
}

function clearAuthCookies(res) {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
}

module.exports = { issueAuthTokens, rotateRefreshToken, setAuthCookies, clearAuthCookies };

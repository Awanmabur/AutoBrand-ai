const SocialAccount = require('../../models/SocialAccount');
const { encryptToken } = require('../tokenCryptoService');

async function upsertConnectedAccount({ user, brand, platform, accountId, accountName, accessToken, refreshToken, expiresAt, scopes = [], metadata = {} }) {
  const update = {
    owner: user?._id || user,
    brand: brand?._id || brand,
    platform,
    accountId,
    accountName,
    status: 'connected',
    permissions: scopes,
    tokenExpiresAt: expiresAt,
    lastSyncAt: new Date(),
    providerMeta: metadata
  };
  if (accessToken) update.accessTokenEncrypted = encryptToken(accessToken);
  if (refreshToken) update.refreshTokenEncrypted = encryptToken(refreshToken);
  return SocialAccount.findOneAndUpdate(
    { owner: update.owner, platform, accountId },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function markAccountHealth(account, { status = 'connected', errorMessage = '', permissions = [] } = {}) {
  account.status = status;
  account.providerMeta = { ...(account.providerMeta || {}), errorMessage, lastHealthCheckAt: new Date() };
  account.permissions = permissions.length ? permissions : account.permissions;
  await account.save();
  return account;
}

async function disconnectAccount(account, { hard = false } = {}) {
  if (hard && typeof account.deleteOne === 'function') return account.deleteOne();
  account.status = 'disconnected';
  account.accessTokenEncrypted = undefined;
  account.refreshTokenEncrypted = undefined;
  await account.save();
  return account;
}

function tokenNeedsRefresh(account, skewMs = 10 * 60 * 1000) {
  if (!account.tokenExpiresAt) return false;
  return new Date(account.tokenExpiresAt).getTime() - Date.now() < skewMs;
}

module.exports = { disconnectAccount, markAccountHealth, tokenNeedsRefresh, upsertConnectedAccount };

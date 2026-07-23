const SocialAccount = require('../../models/SocialAccount');
const { evaluateSocialAccountHealth } = require('./socialAccountHealth.service');
const { canDecryptToken } = require('../tokenCryptoService');

const PLATFORM_CATALOG = Object.freeze([
  { key: 'facebook', label: 'Facebook', order: 10 },
  { key: 'instagram', label: 'Instagram', order: 20 },
  { key: 'google_business', label: 'Google Business Profile', order: 30 },
  { key: 'linkedin', label: 'LinkedIn', order: 40 },
  { key: 'pinterest', label: 'Pinterest', order: 50 },
  { key: 'tiktok', label: 'TikTok', order: 60 },
  { key: 'youtube', label: 'YouTube', order: 70 },
  { key: 'x', label: 'X', order: 80 },
  { key: 'threads', label: 'Threads', order: 90 }
]);

const PLATFORM_BY_KEY = new Map(PLATFORM_CATALOG.map((platform) => [platform.key, platform]));

function stringId(value) {
  if (!value) return '';
  return String(value?._id || value);
}

function accountBrandId(account = {}) {
  return stringId(account.brand?._id || account.brand);
}

function isRealSocialAccount(account = {}) {
  const name = String(account.accountName || '').toLowerCase();
  return account.status !== 'mock' && !name.includes('(development)') && !account.providerMeta?.removedAt;
}

function destinationReadiness(account = {}, { verifyEncryption = false, now = new Date() } = {}) {
  const health = evaluateSocialAccountHealth(account, now);
  const blockers = [];

  if (!isRealSocialAccount(account)) blockers.push('not_live');
  if (account.status !== 'connected') blockers.push(`status_${account.status || 'unknown'}`);
  if (!account.accountId) blockers.push('missing_account_id');
  if (!account.accessTokenEncrypted) blockers.push('missing_access_token');
  if (health.status !== 'connected') blockers.push(health.status || 'unhealthy');
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() <= now.getTime()) blockers.push('token_expired');
  if (account.platform === 'instagram' && !account.providerMeta?.permissionGrantVerifiedAt) blockers.push('instagram_permission_not_verified');

  if (verifyEncryption && account.accessTokenEncrypted) {
    const credentialCheck = canDecryptToken(account.accessTokenEncrypted);
    if (!credentialCheck.ok) blockers.push('token_decryption_failed');
  }

  return {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    health
  };
}

function readySocialAccounts(accounts = [], options = {}) {
  return (accounts || []).filter((account) => destinationReadiness(account, options).ready);
}

function normalizePlatforms(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values
    .flatMap((item) => String(item || '').split(/[\s,]+/))
    .map((item) => item.trim().toLowerCase())
    .filter((item) => PLATFORM_BY_KEY.has(item)))];
}

function platformLabel(key) {
  return PLATFORM_BY_KEY.get(String(key || '').toLowerCase())?.label || String(key || '').replace(/_/g, ' ');
}

function buildComposerDestinationCatalog(accounts = [], options = {}) {
  const readyAccounts = readySocialAccounts(accounts, options);
  const platforms = new Map();

  readyAccounts.forEach((account) => {
    const key = String(account.platform || '').toLowerCase();
    if (!PLATFORM_BY_KEY.has(key)) return;
    const brandId = accountBrandId(account);
    const current = platforms.get(key) || {
      ...PLATFORM_BY_KEY.get(key),
      accountCount: 0,
      brandIds: [],
      capabilities: destinationReadiness(account, options).health.capabilities || {}
    };
    current.accountCount += 1;
    if (brandId && !current.brandIds.includes(brandId)) current.brandIds.push(brandId);
    platforms.set(key, current);
  });

  return {
    accounts: readyAccounts,
    platforms: [...platforms.values()].sort((a, b) => a.order - b.order),
    platformKeys: [...platforms.values()].sort((a, b) => a.order - b.order).map((platform) => platform.key)
  };
}

function platformsForBrand(accounts = [], brandId, options = {}) {
  const id = stringId(brandId);
  return buildComposerDestinationCatalog(
    (accounts || []).filter((account) => !id || accountBrandId(account) === id),
    options
  ).platformKeys;
}

function accountsForPlatform(accounts = [], platform, brandId = '') {
  const normalizedPlatform = String(platform || '').toLowerCase();
  const normalizedBrand = stringId(brandId);
  return (accounts || []).filter((account) => (
    String(account.platform || '').toLowerCase() === normalizedPlatform
    && (!normalizedBrand || accountBrandId(account) === normalizedBrand)
  ));
}

function publishingTargetError(message, details = {}) {
  const error = new Error(message);
  error.code = 'PUBLISHING_TARGETS_UNAVAILABLE';
  error.status = 400;
  error.details = details;
  return error;
}

async function resolvePublishingTargets({
  ownerId,
  brandId,
  requestedPlatforms = [],
  requestedAccountIds = [],
  requireReady = true,
  allowPlatformDefaults = true
}) {
  const platforms = normalizePlatforms(requestedPlatforms);
  const selectedIds = [...new Set((Array.isArray(requestedAccountIds) ? requestedAccountIds : requestedAccountIds ? [requestedAccountIds] : [])
    .flatMap((item) => String(item || '').split(/[\s,]+/))
    .filter(Boolean))];

  const query = {
    owner: ownerId,
    brand: brandId,
    status: 'connected'
  };
  if (selectedIds.length) query._id = { $in: selectedIds };
  if (platforms.length) query.platform = { $in: platforms };

  const candidates = await SocialAccount.find(query)
    .select('_id brand owner platform accountName accountId accessTokenEncrypted tokenExpiresAt status permissions providerMeta healthStatus')
    .sort({ platform: 1, accountName: 1 });

  if (selectedIds.length && candidates.length !== selectedIds.length) {
    throw publishingTargetError(
      'One or more selected destinations were removed, disconnected, or belong to another brand. Select the live destinations again.',
      { selectedIds, foundIds: candidates.map((account) => stringId(account)) }
    );
  }

  const ready = requireReady
    ? candidates.filter((account) => destinationReadiness(account, { verifyEncryption: true }).ready)
    : candidates.filter((account) => isRealSocialAccount(account) && account.status === 'connected');

  if (selectedIds.length && ready.length !== candidates.length) {
    const blocked = candidates
      .filter((account) => !ready.some((readyAccount) => stringId(readyAccount) === stringId(account)))
      .map((account) => ({
        id: stringId(account),
        platform: account.platform,
        accountName: account.accountName,
        blockers: destinationReadiness(account, { verifyEncryption: requireReady }).blockers
      }));
    throw publishingTargetError('One or more selected destinations need reconnecting before they can be used.', { blocked });
  }

  if (!selectedIds.length && !allowPlatformDefaults && !ready.length) {
    throw publishingTargetError('Select at least one connected social destination.');
  }

  const readyPlatforms = [...new Set(ready.map((account) => account.platform))];
  const missingPlatforms = platforms.filter((platform) => !readyPlatforms.includes(platform));
  if (missingPlatforms.length) {
    throw publishingTargetError(
      `No live connected destination is ready for: ${missingPlatforms.map(platformLabel).join(', ')}.`,
      { missingPlatforms }
    );
  }

  if (!ready.length) {
    throw publishingTargetError('Connect at least one live social destination for this brand before creating publishable content.');
  }

  return {
    accounts: ready,
    accountIds: ready.map((account) => account._id),
    platforms: platforms.length ? platforms : readyPlatforms,
    byPlatform: ready.reduce((map, account) => {
      map[account.platform] = map[account.platform] || [];
      map[account.platform].push(account);
      return map;
    }, {})
  };
}

module.exports = {
  PLATFORM_CATALOG,
  accountBrandId,
  accountsForPlatform,
  buildComposerDestinationCatalog,
  destinationReadiness,
  isRealSocialAccount,
  normalizePlatforms,
  platformLabel,
  platformsForBrand,
  publishingTargetError,
  readySocialAccounts,
  resolvePublishingTargets,
  stringId
};

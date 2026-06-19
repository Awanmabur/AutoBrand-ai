const { DEFAULT_PLATFORM_RULES } = require('../composer/defaultPlatformRules');

const REQUIRED_PERMISSIONS = {
  facebook: ['pages_manage_posts', 'pages_read_engagement'],
  instagram: ['instagram_basic', 'instagram_content_publish'],
  google_business: ['https://www.googleapis.com/auth/business.manage'],
  linkedin: ['w_member_social'],
  pinterest: ['pins:write'],
  tiktok: ['video.upload'],
  youtube: ['https://www.googleapis.com/auth/youtube.upload'],
  x: ['tweet.write'],
  threads: ['threads_content_publish'],
  whatsapp: ['whatsapp_business_messaging']
};

function publishingCapabilities(platform = '') {
  const key = String(platform || 'facebook').toLowerCase();
  const rule = DEFAULT_PLATFORM_RULES[key] || DEFAULT_PLATFORM_RULES.facebook;
  const types = new Set(rule.mediaTypes || []);
  return {
    text: types.has('text'),
    image: types.has('image'),
    carousel: Boolean(rule.supportsCarousel),
    video: types.has('video') || types.has('reel') || types.has('short'),
    reel: types.has('reel') || types.has('short') || key === 'tiktok',
    story: Boolean(rule.supportsStory),
    link: Boolean(rule.supportsLinks),
    scheduling: Boolean(rule.supportsScheduling),
    directPublishing: Boolean(rule.supportsDirectPublishing)
  };
}

function requiredPermissions(platform = '') {
  return REQUIRED_PERMISSIONS[String(platform || '').toLowerCase()] || ['publish'];
}

function missingPermissions(account = {}) {
  const granted = new Set((account.permissions || []).map((permission) => String(permission).toLowerCase()));
  return requiredPermissions(account.platform).filter((permission) => !granted.has(String(permission).toLowerCase()));
}

function tokenExpired(account = {}, now = new Date()) {
  if (!account.tokenExpiresAt) return false;
  return new Date(account.tokenExpiresAt).getTime() <= now.getTime();
}

function evaluateSocialAccountHealth(account = {}, now = new Date()) {
  const status = account.status || 'connected';
  const missing = status === 'mock' ? [] : missingPermissions(account);
  const capabilities = publishingCapabilities(account.platform);

  if (status === 'disconnected') {
    return { status: 'disabled', healthStatus: 'failed', label: 'Disabled', message: 'This account is disconnected and will not publish.', missingPermissions: missing, capabilities };
  }
  if (status === 'failed') {
    return { status: 'failed', healthStatus: 'failed', label: 'Failed', message: account.lastPublishError || 'The last provider check or publish failed.', missingPermissions: missing, capabilities };
  }
  if (status === 'expired' || tokenExpired(account, now)) {
    return { status: 'expired', healthStatus: 'warning', label: 'Expired', message: 'The access token is expired. Reconnect this account.', missingPermissions: missing, capabilities };
  }
  if (status === 'needs_reconnect' || (!account.accessTokenEncrypted && status !== 'mock')) {
    return { status: 'needs_reconnect', healthStatus: 'warning', label: 'Needs reconnect', message: 'Reconnect or add a fresh token before publishing.', missingPermissions: missing, capabilities };
  }
  if (missing.length) {
    return { status: 'missing_permission', healthStatus: 'warning', label: 'Missing permission', message: `Missing permission(s): ${missing.join(', ')}`, missingPermissions: missing, capabilities };
  }
  return { status: 'connected', healthStatus: 'healthy', label: status === 'mock' ? 'Development connected' : 'Connected', message: 'Account is ready for supported publishing actions.', missingPermissions: [], capabilities };
}

async function applySocialAccountHealth(account, now = new Date()) {
  const health = evaluateSocialAccountHealth(account, now);
  account.healthStatus = health.healthStatus;
  account.lastHealthCheckAt = now;
  account.providerMeta = {
    ...(account.providerMeta || {}),
    health: {
      status: health.status,
      message: health.message,
      missingPermissions: health.missingPermissions,
      checkedAt: now
    }
  };
  if (health.status === 'expired') account.status = 'expired';
  if (health.status === 'needs_reconnect' || health.status === 'missing_permission') account.status = 'needs_reconnect';
  await account.save();
  return health;
}

function capabilityList(capabilities = {}) {
  return Object.entries(capabilities)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase());
}

module.exports = {
  applySocialAccountHealth,
  capabilityList,
  evaluateSocialAccountHealth,
  missingPermissions,
  publishingCapabilities,
  requiredPermissions,
  tokenExpired
};

const Brand = require('../../models/Brand');
const SocialAccount = require('../../models/SocialAccount');
const {
  buildFacebookAuthUrl,
  connectFacebookPageToken,
  exchangeCodeForPageAccounts,
  facebookConnectionChecklist,
  hasFacebookBusinessLoginConfig,
  isFacebookConfigured
} = require('../../services/facebookService');
const { assertCanConnectSocial, availableSocialSlots, findExistingSocialAccount } = require('../../services/usageLimitService');
const { encryptToken } = require('../../services/tokenCryptoService');
const {
  buildGoogleBusinessAuthUrl,
  exchangeCodeForGoogleBusinessLocations,
  isGoogleBusinessConfigured,
  syncGoogleBusinessLocation
} = require('../../services/googleBusinessProfileService');
const {
  buildLinkedInAuthUrl,
  exchangeCodeForLinkedInAccounts,
  isLinkedInConfigured,
  syncLinkedInAccount
} = require('../../services/linkedinService');
const {
  buildPinterestAuthUrl,
  exchangeCodeForPinterestBoards,
  isPinterestConfigured,
  syncPinterestBoard
} = require('../../services/pinterestService');
const {
  buildTikTokAuthUrl,
  exchangeCodeForTikTokAccount,
  isTikTokConfigured,
  queryCreatorInfo
} = require('../../services/tiktokService');
const {
  buildThreadsAuthUrl,
  exchangeCodeForThreadsAccount,
  isThreadsConfigured,
  syncThreadsAccount
} = require('../../services/threadsService');
const {
  buildXAuthUrl,
  exchangeCodeForXAccount,
  isXConfigured,
  syncXAccount
} = require('../../services/xService');
const {
  buildYouTubeAuthUrl,
  exchangeCodeForYouTubeAccount,
  isYouTubeConfigured,
  syncYouTubeChannel
} = require('../../services/youtubeService');
const { applySocialAccountHealth } = require('../../services/social/socialAccountHealth.service');
const { notifyAccountDisconnected } = require('../../services/notification.service');

const socialPlatforms = [
  { key: 'facebook', name: 'Facebook Pages', shortName: 'Facebook', icon: 'f', description: 'Connect Pages through Facebook OAuth and publish directly.', active: true, kind: 'oauth', primaryAction: 'Connect Pages', hint: 'Opens Facebook, choose Pages, then returns here ready to publish.' },
  { key: 'instagram', name: 'Instagram Business', shortName: 'Instagram', icon: 'ig', description: 'Connect an Instagram Business profile for reels, images, and captions.', active: true, kind: 'api', primaryAction: 'Connect profile', hint: 'Use an Instagram Business account ID and a Meta access token.' },
  { key: 'google_business', name: 'Google Business Profile', shortName: 'Google Profile', icon: 'g', description: 'Publish local updates, offers, and announcements to Search and Maps.', active: true, kind: 'oauth', primaryAction: 'Open Google', hint: 'Opens Google authorization and saves each Business Profile location.', setupHint: 'Add GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET, or reuse GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then add the callback URL in Google Cloud.' },
  { key: 'linkedin', name: 'LinkedIn Profile / Page', shortName: 'LinkedIn', icon: 'in', description: 'Publish professional updates to a LinkedIn profile or organization Page.', active: true, kind: 'oauth', primaryAction: 'Open LinkedIn', hint: 'Opens LinkedIn authorization, then returns with the profile and accessible Pages ready to publish.' },
  { key: 'pinterest', name: 'Pinterest Board', shortName: 'Pinterest', icon: 'p', description: 'Publish campaign images as pins on selected boards.', active: true, kind: 'oauth', primaryAction: 'Open Pinterest', hint: 'Opens Pinterest authorization and saves accessible boards.', setupHint: 'Add PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, and the Pinterest callback URL before connecting boards.' },
  { key: 'tiktok', name: 'TikTok Account', shortName: 'TikTok', icon: 'tt', description: 'Connect TikTok with OAuth and publish short-form videos.', active: true, kind: 'oauth', primaryAction: 'Open TikTok', hint: 'Opens TikTok authorization, then returns here ready for video publishing.' },
  { key: 'youtube', name: 'YouTube Shorts', shortName: 'YouTube', icon: 'yt', description: 'Connect with Google OAuth and upload short-form videos.', active: true, kind: 'oauth', primaryAction: 'Open YouTube', hint: 'Opens Google authorization, choose your YouTube channel, then publish videos.' },
  { key: 'x', name: 'X / Twitter', shortName: 'X', icon: 'x', description: 'Publish short posts and campaign updates to X.', active: true, kind: 'oauth', primaryAction: 'Open X', hint: 'Opens X authorization with OAuth 2.0 PKCE and saves the authenticated profile.', setupHint: 'Add X_CLIENT_ID, optional X_CLIENT_SECRET, X_CALLBACK_URL, and X_SCOPES=tweet.read tweet.write users.read offline.access.' },
  { key: 'threads', name: 'Threads', shortName: 'Threads', icon: 'th', description: 'Publish conversation-first posts to Threads.', active: true, kind: 'oauth', primaryAction: 'Open Threads', hint: 'Opens Threads authorization and saves the connected Threads profile.', setupHint: 'Add THREADS_APP_ID, THREADS_APP_SECRET, THREADS_CALLBACK_URL, and use an HTTPS domain for Threads OAuth.' }
];

function allowedApiPlatforms() {
  return socialPlatforms.filter((platform) => platform.kind === 'api').map((platform) => platform.key);
}

function normalizeAccountId(value) {
  return String(value || '').trim();
}

function parsePermissions(value, fallback = []) {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

function defaultPermissionsForPlatform(platform) {
  if (platform === 'instagram') return ['instagram_basic', 'instagram_content_publish'];
  if (platform === 'google_business') return ['https://www.googleapis.com/auth/business.manage'];
  if (platform === 'linkedin') return ['w_member_social'];
  if (platform === 'pinterest') return ['boards:read', 'pins:read', 'pins:write', 'user_accounts:read'];
  if (platform === 'tiktok') return ['user.info.basic', 'video.upload', 'video.publish'];
  if (platform === 'threads') return ['threads_basic', 'threads_content_publish'];
  if (platform === 'x') return ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];
  return ['publish', 'analytics_read'];
}

async function filterAccountsByAvailableSlots(req, accounts) {
  const allowed = [];
  let slots = await availableSocialSlots(req.user);

  for (const account of accounts) {
    const existing = await findExistingSocialAccount(req.user, {
      brand: account.brandId || account.brand,
      platform: account.platform,
      accountId: account.accountId
    });

    if (existing) {
      allowed.push(account);
      continue;
    }

    if (slots > 0) {
      allowed.push(account);
      slots -= 1;
    }
  }

  return allowed;
}

async function upsertConnectedAccount(account, brand) {
  const platform = account.platform || 'facebook';
  return SocialAccount.findOneAndUpdate(
    { brand: brand._id, owner: brand.owner, platform, accountId: account.accountId },
    {
      brand: brand._id,
      owner: brand.owner,
      platform,
      accountName: account.accountName,
      accountId: account.accountId,
      accessTokenEncrypted: account.accessTokenEncrypted,
      refreshTokenEncrypted: account.refreshTokenEncrypted,
      tokenExpiresAt: account.tokenExpiresAt,
      providerMeta: account.providerMeta,
      permissions: account.permissions || defaultPermissionsForPlatform(platform),
      status: account.status || 'connected',
      lastSyncAt: new Date()
    },
    { upsert: true, new: true }
  );
}

async function socialViewData(req, { error = null } = {}) {
  const [brands, accounts] = await Promise.all([
    Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 }),
    SocialAccount.find({ owner: req.user._id }).populate('brand').sort({ createdAt: -1 })
  ]);

  return {
    title: 'Social Accounts',
    layout: 'layouts/dashboard',
    brands,
    accounts,
    platforms: socialPlatforms,
    facebookReady: isFacebookConfigured(),
    facebookBusinessReady: hasFacebookBusinessLoginConfig(),
    facebookSetup: facebookConnectionChecklist(),
    facebookSetupRequired: Boolean(req.query.facebook_setup),
    googleBusinessReady: isGoogleBusinessConfigured(),
    googleBusinessSetupRequired: Boolean(req.query.google_business_setup),
    pinterestReady: isPinterestConfigured(),
    pinterestSetupRequired: Boolean(req.query.pinterest_setup),
    tiktokReady: isTikTokConfigured(),
    tiktokSetupRequired: Boolean(req.query.tiktok_setup),
    threadsReady: isThreadsConfigured(),
    threadsSetupRequired: Boolean(req.query.threads_setup),
    xReady: isXConfigured(),
    xSetupRequired: Boolean(req.query.x_setup),
    youtubeReady: isYouTubeConfigured(),
    youtubeSetupRequired: Boolean(req.query.youtube_setup),
    linkedinReady: isLinkedInConfigured(),
    linkedinSetupRequired: Boolean(req.query.linkedin_setup),
    error: error || req.query.facebook_error || req.query.google_business_error || req.query.pinterest_error || req.query.tiktok_error || req.query.threads_error || req.query.x_error || req.query.youtube_error || req.query.linkedin_error || null,
    notice: req.query.notice || null
  };
}

function socialRedirectTarget(req, options = {}) {
  const params = new URLSearchParams();
  const error = options.error || req.query.facebook_error || req.query.google_business_error || req.query.pinterest_error || req.query.tiktok_error || req.query.threads_error || req.query.x_error || req.query.youtube_error || req.query.linkedin_error || '';
  const notice = options.notice || req.query.notice || '';
  if (error) params.set('error', error);
  if (notice) params.set('notice', notice);
  const query = params.toString();
  return `/dashboard/social${query ? `?${query}` : ''}`;
}

async function renderSocialIndex(req, res, options = {}) {
  return res.redirect(303, socialRedirectTarget(req, options));
}

async function index(req, res, next) {
  try {
    return renderSocialIndex(req, res);
  } catch (error) {
    return next(error);
  }
}

async function storeMock(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    const platform = String(req.body.platform || '').trim();
    const accountId = normalizeAccountId(req.body.accountId);
    await assertCanConnectSocial(req.user, { brand: brand._id, platform, accountId });

    await SocialAccount.findOneAndUpdate(
      { brand: brand._id, owner: req.user._id, platform, accountId },
      {
        brand: brand._id,
        owner: req.user._id,
        platform,
        accountName: String(req.body.accountName || '').trim(),
        accountId,
        accessTokenEncrypted: req.body.accessToken ? encryptToken(req.body.accessToken) : undefined,
        permissions: ['draft_publish', 'analytics_read'],
        status: 'mock',
        lastSyncAt: new Date()
      },
      { upsert: true, new: true }
    );

    return res.redirect('/dashboard/social');
  } catch (error) {
    return next(error);
  }
}

async function manualApiConnect(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    const platform = String(req.body.platform || '').trim();
    const allowed = allowedApiPlatforms();
    if (!allowed.includes(platform)) {
      return res.redirect(303, socialRedirectTarget(req, { error: 'Unsupported API channel selected.' }));
    }

    const accountName = String(req.body.accountName || '').trim();
    const accountId = normalizeAccountId(req.body.accountId);
    const accessToken = String(req.body.accessToken || '').trim();
    if (!accountName || !accountId || !accessToken) {
      return res.redirect(303, socialRedirectTarget(req, { error: 'Account name, ID, and access token are required for API channel setup.' }));
    }

    await assertCanConnectSocial(req.user, { brand: brand._id, platform, accountId });

    await SocialAccount.findOneAndUpdate(
      { brand: brand._id, owner: req.user._id, platform, accountId },
      {
        brand: brand._id,
        owner: req.user._id,
        platform,
        accountName,
        accountId,
        accessTokenEncrypted: encryptToken(accessToken),
        refreshTokenEncrypted: req.body.refreshToken ? encryptToken(String(req.body.refreshToken).trim()) : undefined,
        permissions: parsePermissions(req.body.permissions, defaultPermissionsForPlatform(platform)),
        status: 'connected',
        lastSyncAt: new Date()
      },
      { upsert: true, new: true }
    );
    return res.redirect('/dashboard/social');
  } catch (error) {
    return next(error);
  }
}

async function brandForConnect(req, res) {
  const brand = await Brand.findOne({ _id: req.query.brand, owner: req.user._id });
  if (!brand) {
    res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    return null;
  }
  return brand;
}

async function oauthConnect(req, res, next, { buildAuthUrl, setupQuery, providerErrorName }) {
  try {
    const brand = await brandForConnect(req, res);
    if (!brand) return null;
    const authUrl = buildAuthUrl({ brandId: brand._id.toString(), userId: req.user._id.toString() });
    if (!authUrl) return res.redirect(`/dashboard/social?${setupQuery}=required`);
    return res.redirect(authUrl);
  } catch (error) {
    if (error.name === providerErrorName) {
      return res.redirect(303, socialRedirectTarget(req, { error: error.message }));
    }
    return next(error);
  }
}

async function oauthCallback(req, res, next, { serviceName, platform, exchangeFn, providerErrorName, notice }) {
  try {
    if (req.query.error) {
      return res.redirect(303, socialRedirectTarget(req, { error: req.query.error_description || req.query.error }));
    }
    if (!req.query.code || !req.query.state) {
      return res.redirect(303, socialRedirectTarget(req, { error: `${serviceName} did not return a valid authorization response. Start the connection again.` }));
    }

    const result = await exchangeFn({ code: req.query.code, state: req.query.state });
    const accounts = (Array.isArray(result) ? result : [result]).filter(Boolean);
    if (!accounts.length) {
      return res.redirect(`/dashboard/social?notice=${encodeURIComponent(`${serviceName} did not return any accounts to connect.`)}`);
    }

    const firstAccount = accounts[0];
    if (firstAccount.userId !== req.user._id.toString()) {
      const error = new Error(`${serviceName} connection belongs to another signed-in user. Start the connection again.`);
      error.status = 403;
      throw error;
    }

    const brand = await Brand.findOne({ _id: firstAccount.brandId, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    const normalized = accounts.map((account) => ({ ...account, platform: platform || account.platform }));
    const allowedAccounts = await filterAccountsByAvailableSlots(req, normalized);
    const savedAccounts = await Promise.all(allowedAccounts.map((account) => upsertConnectedAccount(account, brand)));
    const primary = savedAccounts[0];
    if (!primary) {
      return res.redirect(`/dashboard/social?notice=${encodeURIComponent(`No ${serviceName} accounts were added because your plan is full.`)}`);
    }

    const skipped = accounts.length - allowedAccounts.length;
    if (skipped > 0) {
      return res.redirect(`/dashboard/social?notice=${encodeURIComponent(`${savedAccounts.length} ${serviceName} account(s) connected. ${skipped} skipped because your plan is full.`)}&account=${primary._id}`);
    }
    return res.redirect(`/dashboard/social?notice=${encodeURIComponent(notice)}&account=${primary._id}`);
  } catch (error) {
    if (error.name === providerErrorName) {
      return res.redirect(303, socialRedirectTarget(req, { error: error.message }));
    }
    return next(error);
  }
}

async function syncAccount(req, res, next, { platform, syncFn, providerErrorName, syncedNotice, wrongNotice }) {
  try {
    const account = await SocialAccount.findOne({ _id: req.params.id, owner: req.user._id });
    if (!account) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    if (account.platform !== platform) return res.redirect(`/dashboard/social?notice=${wrongNotice}&account=${account._id}`);

    const info = await syncFn({ account });
    const update = {
      accountName: info.accountName || account.accountName,
      accountId: info.accountId || account.accountId,
      lastSyncAt: new Date(),
      status: 'connected'
    };
    if (info.providerMeta) update.providerMeta = info.providerMeta;
    await SocialAccount.findOneAndUpdate({ _id: account._id, owner: req.user._id }, update);
    return res.redirect(`/dashboard/social?notice=${syncedNotice}&account=${account._id}`);
  } catch (error) {
    if (error.name === providerErrorName) {
      return res.redirect(`/dashboard/social?notice=${encodeURIComponent(error.message)}&account=${req.params.id}`);
    }
    return next(error);
  }
}

async function facebookConnect(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.query.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    const authUrl = buildFacebookAuthUrl({ brandId: brand._id.toString(), userId: req.user._id.toString() });
    const setup = facebookConnectionChecklist();
    if (setup.configured && !setup.canStartOAuth) {
      return res.redirect('/dashboard/social?facebook_setup=required');
    }

    if (!authUrl && isFacebookConfigured()) {
      return res.redirect('/dashboard/social?facebook_setup=required');
    }

    if (!authUrl) {
      const devAccountId = `dev_${brand._id}`;
      await assertCanConnectSocial(req.user, { brand: brand._id, platform: 'facebook', accountId: devAccountId });
      await SocialAccount.findOneAndUpdate(
        { brand: brand._id, owner: req.user._id, platform: 'facebook', accountId: devAccountId },
        {
          brand: brand._id,
          owner: req.user._id,
          platform: 'facebook',
          accountName: `${brand.name} Facebook Page (development)`,
          accountId: devAccountId,
          permissions: ['pages_manage_posts', 'pages_read_engagement'],
          status: 'mock',
          lastSyncAt: new Date()
        },
        { upsert: true, new: true }
      );
      return res.redirect('/dashboard/social');
    }

    return res.redirect(authUrl);
  } catch (error) {
    return next(error);
  }
}

async function facebookCallback(req, res, next) {
  return oauthCallback(req, res, next, {
    serviceName: 'Meta',
    platform: null,
    exchangeFn: exchangeCodeForPageAccounts,
    providerErrorName: 'FacebookProviderError',
    notice: 'meta_connected'
  });
}

async function facebookPageToken(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    const pageId = String(req.body.accountId || '').trim();
    await assertCanConnectSocial(req.user, { brand: brand._id, platform: 'facebook', accountId: pageId });

    const account = await connectFacebookPageToken({
      brandId: brand._id.toString(),
      userId: req.user._id.toString(),
      pageAccessToken: String(req.body.pageAccessToken || '').trim(),
      pageId,
      pageName: String(req.body.accountName || '').trim()
    });

    await upsertConnectedAccount(account, brand);
    return res.redirect('/dashboard/social');
  } catch (error) {
    if (error.name === 'FacebookProviderError') {
      return res.redirect(303, socialRedirectTarget(req, { error: error.message }));
    }
    return next(error);
  }
}

async function googleBusinessConnect(req, res, next) {
  return oauthConnect(req, res, next, {
    buildAuthUrl: buildGoogleBusinessAuthUrl,
    setupQuery: 'google_business_setup',
    providerErrorName: 'GoogleBusinessProfileError'
  });
}

async function googleBusinessCallback(req, res, next) {
  return oauthCallback(req, res, next, {
    serviceName: 'Google Business Profile',
    platform: 'google_business',
    exchangeFn: exchangeCodeForGoogleBusinessLocations,
    providerErrorName: 'GoogleBusinessProfileError',
    notice: 'google_business_connected'
  });
}

async function googleBusinessSync(req, res, next) {
  return syncAccount(req, res, next, {
    platform: 'google_business',
    syncFn: syncGoogleBusinessLocation,
    providerErrorName: 'GoogleBusinessProfileError',
    syncedNotice: 'google_business_synced',
    wrongNotice: 'not_google_business'
  });
}

async function pinterestConnect(req, res, next) {
  return oauthConnect(req, res, next, {
    buildAuthUrl: buildPinterestAuthUrl,
    setupQuery: 'pinterest_setup',
    providerErrorName: 'PinterestProviderError'
  });
}

async function pinterestCallback(req, res, next) {
  return oauthCallback(req, res, next, {
    serviceName: 'Pinterest',
    platform: 'pinterest',
    exchangeFn: exchangeCodeForPinterestBoards,
    providerErrorName: 'PinterestProviderError',
    notice: 'pinterest_connected'
  });
}

async function pinterestSync(req, res, next) {
  return syncAccount(req, res, next, {
    platform: 'pinterest',
    syncFn: syncPinterestBoard,
    providerErrorName: 'PinterestProviderError',
    syncedNotice: 'pinterest_synced',
    wrongNotice: 'not_pinterest'
  });
}

async function tiktokConnect(req, res, next) {
  return oauthConnect(req, res, next, {
    buildAuthUrl: buildTikTokAuthUrl,
    setupQuery: 'tiktok_setup',
    providerErrorName: 'TikTokProviderError'
  });
}

async function tiktokCallback(req, res, next) {
  return oauthCallback(req, res, next, {
    serviceName: 'TikTok',
    platform: 'tiktok',
    exchangeFn: exchangeCodeForTikTokAccount,
    providerErrorName: 'TikTokProviderError',
    notice: 'tiktok_connected'
  });
}

async function tiktokSync(req, res, next) {
  try {
    const account = await SocialAccount.findOne({ _id: req.params.id, owner: req.user._id });
    if (!account) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    if (account.platform !== 'tiktok') return res.redirect(`/dashboard/social?notice=not_tiktok&account=${account._id}`);
    const info = await queryCreatorInfo({ account });
    const update = { lastSyncAt: new Date(), status: 'connected' };
    if (info.creator_nickname || info.creator_username) update.accountName = info.creator_nickname || info.creator_username;
    await SocialAccount.findOneAndUpdate({ _id: account._id, owner: req.user._id }, update);
    return res.redirect(`/dashboard/social?notice=tiktok_synced&account=${account._id}`);
  } catch (error) {
    if (error.name === 'TikTokProviderError') {
      return res.redirect(`/dashboard/social?notice=${encodeURIComponent(error.message)}&account=${req.params.id}`);
    }
    return next(error);
  }
}

async function threadsConnect(req, res, next) {
  return oauthConnect(req, res, next, {
    buildAuthUrl: buildThreadsAuthUrl,
    setupQuery: 'threads_setup',
    providerErrorName: 'ThreadsProviderError'
  });
}

async function threadsCallback(req, res, next) {
  return oauthCallback(req, res, next, {
    serviceName: 'Threads',
    platform: 'threads',
    exchangeFn: exchangeCodeForThreadsAccount,
    providerErrorName: 'ThreadsProviderError',
    notice: 'threads_connected'
  });
}

async function threadsSync(req, res, next) {
  return syncAccount(req, res, next, {
    platform: 'threads',
    syncFn: syncThreadsAccount,
    providerErrorName: 'ThreadsProviderError',
    syncedNotice: 'threads_synced',
    wrongNotice: 'not_threads'
  });
}

async function xConnect(req, res, next) {
  return oauthConnect(req, res, next, {
    buildAuthUrl: buildXAuthUrl,
    setupQuery: 'x_setup',
    providerErrorName: 'XProviderError'
  });
}

async function xCallback(req, res, next) {
  return oauthCallback(req, res, next, {
    serviceName: 'X / Twitter',
    platform: 'x',
    exchangeFn: exchangeCodeForXAccount,
    providerErrorName: 'XProviderError',
    notice: 'x_connected'
  });
}

async function xSync(req, res, next) {
  return syncAccount(req, res, next, {
    platform: 'x',
    syncFn: syncXAccount,
    providerErrorName: 'XProviderError',
    syncedNotice: 'x_synced',
    wrongNotice: 'not_x'
  });
}

async function youtubeConnect(req, res, next) {
  return oauthConnect(req, res, next, {
    buildAuthUrl: buildYouTubeAuthUrl,
    setupQuery: 'youtube_setup',
    providerErrorName: 'YouTubeProviderError'
  });
}

async function youtubeCallback(req, res, next) {
  return oauthCallback(req, res, next, {
    serviceName: 'YouTube',
    platform: 'youtube',
    exchangeFn: exchangeCodeForYouTubeAccount,
    providerErrorName: 'YouTubeProviderError',
    notice: 'youtube_connected'
  });
}

async function youtubeSync(req, res, next) {
  return syncAccount(req, res, next, {
    platform: 'youtube',
    syncFn: syncYouTubeChannel,
    providerErrorName: 'YouTubeProviderError',
    syncedNotice: 'youtube_synced',
    wrongNotice: 'not_youtube'
  });
}

async function linkedinConnect(req, res, next) {
  return oauthConnect(req, res, next, {
    buildAuthUrl: buildLinkedInAuthUrl,
    setupQuery: 'linkedin_setup',
    providerErrorName: 'LinkedInProviderError'
  });
}

async function linkedinCallback(req, res, next) {
  return oauthCallback(req, res, next, {
    serviceName: 'LinkedIn',
    platform: 'linkedin',
    exchangeFn: exchangeCodeForLinkedInAccounts,
    providerErrorName: 'LinkedInProviderError',
    notice: 'linkedin_connected'
  });
}

async function linkedinSync(req, res, next) {
  return syncAccount(req, res, next, {
    platform: 'linkedin',
    syncFn: syncLinkedInAccount,
    providerErrorName: 'LinkedInProviderError',
    syncedNotice: 'linkedin_synced',
    wrongNotice: 'not_linkedin'
  });
}

async function showAccount(req, res, next) {
  try {
    const account = await SocialAccount.findOne({ _id: req.params.id, owner: req.user._id });
    if (!account) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    return res.redirect(303, `/dashboard/social?account=${encodeURIComponent(String(account._id))}`);
  } catch (error) {
    return next(error);
  }
}

async function updateAccount(req, res, next) {
  try {
    const account = await SocialAccount.findOne({ _id: req.params.id, owner: req.user._id });
    if (!account) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    const accountName = String(req.body.accountName || '').trim();
    const accountId = normalizeAccountId(req.body.accountId) || account.accountId;
    const permissions = parsePermissions(req.body.permissions, account.permissions || []);
    const accessToken = String(req.body.accessToken || '').trim();
    const refreshToken = String(req.body.refreshToken || '').trim();

    if (accountId && accountId !== account.accountId) {
      const duplicate = await findExistingSocialAccount(req.user, {
        brand: account.brand,
        platform: account.platform,
        accountId,
        excludeId: account._id
      });
      if (duplicate) return res.redirect(`/dashboard/social?notice=${encodeURIComponent('Another channel already uses that account ID.')}&account=${account._id}`);
    }

    const update = {
      accountName: accountName || account.accountName,
      accountId,
      permissions,
      status: req.body.status || account.status,
      lastSyncAt: new Date()
    };
    if (accessToken) update.accessTokenEncrypted = encryptToken(accessToken);
    if (refreshToken) update.refreshTokenEncrypted = encryptToken(refreshToken);

    await SocialAccount.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, update, { new: true, runValidators: true });
    return res.redirect(`/dashboard/social?notice=updated&account=${req.params.id}`);
  } catch (error) {
    return next(error);
  }
}

async function disconnect(req, res, next) {
  try {
    const account = await SocialAccount.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      {
        $set: { status: 'disconnected', lastSyncAt: new Date() },
        $unset: { accessTokenEncrypted: '', refreshTokenEncrypted: '', tokenExpiresAt: '' }
      },
      { new: true }
    );
    if (!account) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await notifyAccountDisconnected({
      user: req.user,
      account,
      health: { status: 'disabled', message: `${account.accountName || account.platform} was disconnected.` }
    });
    return res.redirect(`/dashboard/social?notice=disconnected&account=${account._id}`);
  } catch (error) {
    return next(error);
  }
}

async function reconnect(req, res, next) {
  try {
    const account = await SocialAccount.findOne({ _id: req.params.id, owner: req.user._id }).populate('brand');
    if (!account) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    if (account.platform === 'facebook' && isFacebookConfigured()) {
      const setup = facebookConnectionChecklist();
      if (!setup.canStartOAuth) return res.redirect('/dashboard/social?facebook_setup=required');
      const authUrl = buildFacebookAuthUrl({ brandId: account.brand._id.toString(), userId: req.user._id.toString() });
      if (authUrl) return res.redirect(authUrl);
    }
    if (account.platform === 'google_business' && isGoogleBusinessConfigured()) {
      const authUrl = buildGoogleBusinessAuthUrl({ brandId: account.brand._id.toString(), userId: req.user._id.toString() });
      if (authUrl) return res.redirect(authUrl);
      return res.redirect('/dashboard/social?google_business_setup=required');
    }
    if (account.platform === 'pinterest' && isPinterestConfigured()) {
      const authUrl = buildPinterestAuthUrl({ brandId: account.brand._id.toString(), userId: req.user._id.toString() });
      if (authUrl) return res.redirect(authUrl);
      return res.redirect('/dashboard/social?pinterest_setup=required');
    }
    if (account.platform === 'tiktok' && isTikTokConfigured()) {
      const authUrl = buildTikTokAuthUrl({ brandId: account.brand._id.toString(), userId: req.user._id.toString() });
      if (authUrl) return res.redirect(authUrl);
      return res.redirect('/dashboard/social?tiktok_setup=required');
    }
    if (account.platform === 'threads' && isThreadsConfigured()) {
      const authUrl = buildThreadsAuthUrl({ brandId: account.brand._id.toString(), userId: req.user._id.toString() });
      if (authUrl) return res.redirect(authUrl);
      return res.redirect('/dashboard/social?threads_setup=required');
    }
    if (account.platform === 'x' && isXConfigured()) {
      const authUrl = buildXAuthUrl({ brandId: account.brand._id.toString(), userId: req.user._id.toString() });
      if (authUrl) return res.redirect(authUrl);
      return res.redirect('/dashboard/social?x_setup=required');
    }
    if (account.platform === 'youtube' && isYouTubeConfigured()) {
      const authUrl = buildYouTubeAuthUrl({ brandId: account.brand._id.toString(), userId: req.user._id.toString() });
      if (authUrl) return res.redirect(authUrl);
      return res.redirect('/dashboard/social?youtube_setup=required');
    }
    if (account.platform === 'linkedin' && isLinkedInConfigured()) {
      const authUrl = buildLinkedInAuthUrl({ brandId: account.brand._id.toString(), userId: req.user._id.toString() });
      if (authUrl) return res.redirect(authUrl);
      return res.redirect('/dashboard/social?linkedin_setup=required');
    }

    account.status = account.accessTokenEncrypted ? 'connected' : 'needs_reconnect';
    account.lastSyncAt = new Date();
    await account.save();
    return res.redirect(`/dashboard/social?notice=reconnected&account=${account._id}`);
  } catch (error) {
    return next(error);
  }
}

async function healthCheck(req, res, next) {
  try {
    const account = await SocialAccount.findOne({ _id: req.params.id, owner: req.user._id });
    if (!account) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    const health = await applySocialAccountHealth(account);
    if (health.status !== 'connected') {
      await notifyAccountDisconnected({ user: req.user, account, health });
    }
    return res.redirect(`/dashboard/social?notice=${encodeURIComponent(`health_${health.status}`)}&account=${account._id}`);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  disconnect,
  facebookCallback,
  facebookConnect,
  facebookPageToken,
  googleBusinessCallback,
  googleBusinessConnect,
  googleBusinessSync,
  healthCheck,
  index,
  linkedinCallback,
  linkedinConnect,
  linkedinSync,
  manualApiConnect,
  pinterestCallback,
  pinterestConnect,
  pinterestSync,
  reconnect,
  showAccount,
  storeMock,
  threadsCallback,
  threadsConnect,
  threadsSync,
  tiktokCallback,
  tiktokConnect,
  tiktokSync,
  updateAccount,
  xCallback,
  xConnect,
  xSync,
  youtubeCallback,
  youtubeConnect,
  youtubeSync
};

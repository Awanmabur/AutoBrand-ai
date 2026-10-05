const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const env = require('../src/config/env');
const Post = require('../src/models/Post');
const SocialAccount = require('../src/models/SocialAccount');
const { validateEnvironment } = require('../src/config/validateEnv');
const { isCloudinaryConfigured } = require('../src/config/cloudinary');
const { buildPublishingReadiness } = require('../src/services/publishingReadiness.service');
const { partitionAvailableMedia } = require('../src/services/mediaAvailability.service');
const { verifyMetaPublishingAccount } = require('../src/services/facebookService');
const { destinationReadiness } = require('../src/services/social/socialDestination.service');

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || '';
}

function postForPlatform(post, platform) {
  const base = typeof post.toObject === 'function' ? post.toObject() : post;
  const variation = (base.platformVariations || []).find((item) => item.platform === platform);
  return {
    ...base,
    platform,
    caption: variation?.caption || base.caption,
    hashtags: variation?.hashtags?.length ? variation.hashtags : base.hashtags,
    firstComment: variation?.firstComment || base.firstComment,
    altText: variation?.altText || base.altText,
    thumbnail: variation?.thumbnail || base.thumbnail,
    videoTitle: variation?.videoTitle || base.videoTitle,
    videoDescription: variation?.videoDescription || base.videoDescription,
    shortVideoHook: variation?.shortVideoHook || base.shortVideoHook
  };
}

async function diagnosePost(post, { live = false } = {}) {
  const platforms = [...new Set(post.platforms?.length ? post.platforms : [post.platform])];
  const availability = await partitionAvailableMedia(post.media || []);
  const readiness = [];
  const selectedAccounts = Array.isArray(post.targetAccounts) ? post.targetAccounts.filter(Boolean) : [];
  for (const platform of platforms) {
    const contentReadiness = await buildPublishingReadiness(postForPlatform(post, platform));
    let platformAccounts = selectedAccounts.filter((account) => account.platform === platform);
    if (!platformAccounts.length && post.brand?._id) {
      platformAccounts = await SocialAccount.find({
        brand: post.brand._id,
        owner: post.brand.owner,
        platform
      }).sort({ accountName: 1 });
    }
    const accountChecks = platformAccounts.map((account) => {
      const check = destinationReadiness(account, { verifyEncryption: true });
      return {
        id: String(account._id),
        accountName: account.accountName || '',
        status: account.status || '',
        healthStatus: check.health?.healthStatus || account.healthStatus || 'unknown',
        ready: check.ready,
        blockers: check.blockers || []
      };
    });
    const hasReadyAccount = accountChecks.some((account) => account.ready);
    const accountBlockers = accountChecks.length
      ? [...new Set(accountChecks.flatMap((account) => account.blockers.map((blocker) => `${account.accountName || platform}: ${blocker}`)))]
      : [`No saved ${platform} destination is available for this brand.`];
    readiness.push({
      platform,
      ...contentReadiness,
      contentReady: contentReadiness.ready,
      accountReady: hasReadyAccount,
      ready: contentReadiness.ready && hasReadyAccount,
      accountBlockers: hasReadyAccount ? [] : accountBlockers,
      accounts: accountChecks
    });
  }

  const liveMetaChecks = [];
  if (live) {
    for (const account of (post.targetAccounts || []).filter((item) => ['facebook', 'instagram'].includes(item.platform))) {
      try {
        const result = await verifyMetaPublishingAccount({ account });
        liveMetaChecks.push({
          id: String(account._id),
          platform: account.platform,
          ok: true,
          providerAccountId: result.accountId,
          providerAccountName: result.accountName,
          tasks: result.tasks || []
        });
      } catch (error) {
        liveMetaChecks.push({
          id: String(account._id),
          platform: account.platform,
          ok: false,
          error: error.message
        });
      }
    }
  }

  return {
    id: String(post._id),
    title: post.title || '',
    status: post.status,
    platforms,
    scheduledAt: post.scheduledAt || null,
    publishedAt: post.publishedAt || null,
    errorMessage: post.errorMessage || '',
    generation: post.platformMetadata?.generation || null,
    media: {
      total: (post.media || []).length,
      available: availability.available.map((item) => ({
        id: String(item._id),
        type: item.fileType,
        fileName: item.fileName,
        fileUrl: item.fileUrl
      })),
      missing: availability.missing.map((item) => ({
        id: String(item.row?._id || ''),
        type: item.row?.fileType || '',
        fileName: item.row?.fileName || '',
        fileUrl: item.fileUrl,
        reason: item.reason
      }))
    },
    targetAccounts: (post.targetAccounts || []).map((account) => {
      const accountReadiness = destinationReadiness(account, { verifyEncryption: true });
      return {
        id: String(account._id),
        platform: account.platform,
        accountName: account.accountName,
        providerAccountId: account.accountId || '',
        status: account.status,
        healthStatus: accountReadiness.health?.healthStatus || account.healthStatus,
        effectiveStatus: accountReadiness.health?.status || account.status,
        readyToPublish: accountReadiness.ready,
        readinessBlockers: accountReadiness.blockers || [],
        tokenStored: Boolean(account.accessTokenEncrypted),
        tokenExpiresAt: account.tokenExpiresAt || null,
        tokenExpired: Boolean(account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() <= Date.now()),
        permissions: account.permissions || [],
        permissionGrantVerifiedAt: account.providerMeta?.permissionGrantVerifiedAt || null,
        missingPermissions: accountReadiness.health?.missingPermissions || account.providerMeta?.missingPermissions || [],
        reconnectRequiredAt: account.reconnectRequiredAt || null,
        lastPublishError: account.lastPublishError || ''
      };
    }),
    readiness: readiness.map((item) => ({
      platform: item.platform,
      ready: item.ready,
      contentReady: item.contentReady,
      accountReady: item.accountReady,
      blockers: [...new Set([...(item.blockers || []), ...(item.accountBlockers || [])])],
      warnings: item.warnings,
      mediaAvailability: item.mediaAvailability,
      accounts: item.accounts
    })),
    publishResults: post.publishResults || [],
    liveMetaChecks
  };
}

async function main() {
  const validation = validateEnvironment();
  await connectDb();
  const postId = argument('post');
  const live = process.argv.includes('--live');
  const limit = Math.max(1, Math.min(50, Number(argument('limit') || 10)));
  const filter = postId ? { _id: postId } : {};
  const posts = await Post.find(filter)
    .populate('brand')
    .populate('media')
    .populate('targetAccounts')
    .sort({ createdAt: -1 })
    .limit(limit);

  const output = {
    runtime: {
      nodeEnv: env.nodeEnv,
      appUrl: env.appUrl,
      publicAppUrl: env.publicAppUrl || '',
      generatedMediaStorage: env.generatedMediaStorage,
      generatedMediaGridFsBucket: env.generatedMediaGridFsBucket,
      cloudinaryConfigured: isCloudinaryConfigured(),
      publishingPaused: env.publishingPaused,
      aiGenerationWorkerMode: env.aiGenerationWorkerMode,
      warnings: validation.warnings
    },
    posts: []
  };

  for (const post of posts) output.posts.push(await diagnosePost(post, { live }));
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });

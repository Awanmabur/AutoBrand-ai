const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const env = require('../src/config/env');
const Post = require('../src/models/Post');
const { validateEnvironment } = require('../src/config/validateEnv');
const { isCloudinaryConfigured } = require('../src/config/cloudinary');
const { buildPublishingReadiness } = require('../src/services/publishingReadiness.service');
const { partitionAvailableMedia } = require('../src/services/mediaAvailability.service');
const { verifyMetaPublishingAccount } = require('../src/services/facebookService');

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
  for (const platform of platforms) {
    readiness.push({ platform, ...(await buildPublishingReadiness(postForPlatform(post, platform))) });
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
    targetAccounts: (post.targetAccounts || []).map((account) => ({
      id: String(account._id),
      platform: account.platform,
      accountName: account.accountName,
      providerAccountId: account.accountId || '',
      status: account.status,
      healthStatus: account.healthStatus,
      tokenStored: Boolean(account.accessTokenEncrypted),
      tokenExpiresAt: account.tokenExpiresAt || null,
      tokenExpired: Boolean(account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() <= Date.now()),
      permissions: account.permissions || [],
      permissionGrantVerifiedAt: account.providerMeta?.permissionGrantVerifiedAt || null,
      missingPermissions: account.providerMeta?.missingPermissions || [],
      reconnectRequiredAt: account.reconnectRequiredAt || null,
      lastPublishError: account.lastPublishError || ''
    })),
    readiness: readiness.map((item) => ({
      platform: item.platform,
      ready: item.ready,
      blockers: item.blockers,
      warnings: item.warnings,
      mediaAvailability: item.mediaAvailability
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

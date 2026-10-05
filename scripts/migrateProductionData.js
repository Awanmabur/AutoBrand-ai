const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const Approval = require('../src/models/Approval');
const ClientApprovalLink = require('../src/models/ClientApprovalLink');
const Post = require('../src/models/Post');
const Campaign = require('../src/models/Campaign');
const Brand = require('../src/models/Brand');
const SocialAccount = require('../src/models/SocialAccount');
const Analytics = require('../src/models/Analytics');
const AiVideoJob = require('../src/models/AiVideoJob');
const VideoRender = require('../src/models/VideoRender');
const Media = require('../src/models/Media');
const BrandAsset = require('../src/models/BrandAsset');
const Subscription = require('../src/models/Subscription');
const GrowthAsset = require('../src/models/GrowthAsset');
const AvatarProfile = require('../src/models/AvatarProfile');
const SubscriptionPlan = require('../src/models/SubscriptionPlan');
const PlanAiConfig = require('../src/models/PlanAiConfig');
const AiProviderConfig = require('../src/models/AiProviderConfig');
const Payment = require('../src/models/Payment');
const AnalyticsSyncJob = require('../src/models/AnalyticsSyncJob');
const { ensureDatabaseIndexes, findPaymentReferenceDuplicates } = require('../src/config/ensureIndexes');
const { seedAnalyticsSyncJobs } = require('../src/services/analytics/analyticsSync.service');
const { snapshotPlan } = require('../src/services/subscription/planSnapshot.service');
const { gridFsIdFromUrl, gridFsPublicUrl, SIGNED_GRIDFS_URL_PATTERN } = require('../src/services/gridFsMediaStorage.service');

const APPLY = process.argv.includes('--apply');
const MOCK_URL = /(?:^|\.)mock\.autobrand\.local/i;
const MOCK_PROVIDER = /^mock(?:_|$)/i;

function id(value) {
  return value?._id?.toString?.() || value?.toString?.() || '';
}

async function backfillBrandForModel(Model, label) {
  const rows = await Model.find({ $or: [{ brand: { $exists: false } }, { brand: null }] })
    .select('_id targetType post campaign brand')
    .lean();
  const ops = [];
  let unresolved = 0;
  for (const row of rows) {
    let brandId = null;
    if (row.post) brandId = (await Post.findById(row.post).select('brand').lean())?.brand;
    if (!brandId && row.campaign) brandId = (await Campaign.findById(row.campaign).select('brand').lean())?.brand;
    if (!brandId) { unresolved += 1; continue; }
    ops.push({ updateOne: { filter: { _id: row._id }, update: { $set: { brand: brandId } } } });
  }
  if (APPLY && ops.length) await Model.bulkWrite(ops, { ordered: false });
  return { label, candidates: rows.length, updates: ops.length, unresolved };
}

async function normalizeSocialAccountTenancy() {
  const accounts = await SocialAccount.find().select('_id brand owner platform accountId status providerMeta').lean();
  const brandIds = [...new Set(accounts.map((row) => id(row.brand)).filter(Boolean))];
  const brands = await Brand.find({ _id: { $in: brandIds } }).select('_id owner').lean();
  const owners = new Map(brands.map((brand) => [id(brand._id), id(brand.owner)]));
  const ops = [];
  let orphaned = 0;
  let mockRows = 0;
  let normalizedIdentifiers = 0;
  for (const account of accounts) {
    const owner = owners.get(id(account.brand));
    if (!owner) { orphaned += 1; continue; }
    const set = {};
    if (id(account.owner) !== owner) set.owner = owner;

    const normalizedPlatform = String(account.platform || '').trim().toLowerCase();
    const normalizedAccountId = String(account.accountId || '').trim();
    if (normalizedPlatform && normalizedPlatform !== account.platform) {
      set.platform = normalizedPlatform;
      normalizedIdentifiers += 1;
    }
    if (normalizedAccountId !== String(account.accountId || '')) {
      set.accountId = normalizedAccountId;
      normalizedIdentifiers += 1;
    }

    if (account.status === 'mock') {
      mockRows += 1;
      set.status = 'needs_reconnect';
      set.reconnectRequiredAt = new Date();
      set.lastPublishError = 'Legacy development/mock connection disabled by production migration. Reconnect the real provider account.';
      set.providerMeta = {
        ...(account.providerMeta || {}),
        migration: { legacyMockDisabledAt: new Date(), reason: 'production_no_mock_credentials' }
      };
    }
    if (Object.keys(set).length) ops.push({ updateOne: { filter: { _id: account._id }, update: { $set: set } } });
  }
  if (APPLY && ops.length) await SocialAccount.bulkWrite(ops, { ordered: false });
  return { candidates: accounts.length, updates: ops.length, orphaned, legacyMockConnections: mockRows, normalizedIdentifiers };
}

function socialAccountStatusRank(status) {
  return ({ connected: 7, needs_reconnect: 6, expired: 5, failed: 4, disconnected: 3, mock: 1 })[String(status || '')] || 0;
}

function socialAccountFreshness(row) {
  return Math.max(
    new Date(row.lastSyncAt || 0).getTime() || 0,
    new Date(row.updatedAt || 0).getTime() || 0,
    new Date(row.createdAt || 0).getTime() || 0
  );
}

function chooseCanonicalSocialAccount(rows) {
  return rows.slice().sort((a, b) => {
    const status = socialAccountStatusRank(b.status) - socialAccountStatusRank(a.status);
    if (status) return status;
    const credential = Number(Boolean(b.accessTokenEncrypted)) - Number(Boolean(a.accessTokenEncrypted));
    if (credential) return credential;
    return socialAccountFreshness(b) - socialAccountFreshness(a);
  })[0];
}

async function remapAnalyticsAccount(duplicateId, canonicalId) {
  const rows = await Analytics.find({ account: duplicateId }).lean();
  let remapped = 0;
  let merged = 0;
  for (const row of rows) {
    const collision = await Analytics.findOne({
      _id: { $ne: row._id },
      post: row.post || null,
      account: canonicalId,
      platform: row.platform,
      recordKind: row.recordKind
    }).lean();

    if (!collision) {
      await Analytics.updateOne({ _id: row._id }, { $set: { account: canonicalId } });
      remapped += 1;
      continue;
    }

    const rowTime = new Date(row.lastSyncedAt || row.updatedAt || row.metricDate || 0).getTime() || 0;
    const collisionTime = new Date(collision.lastSyncedAt || collision.updatedAt || collision.metricDate || 0).getTime() || 0;
    if (rowTime > collisionTime) {
      const fields = [
        'providerPostId', 'availableMetrics', 'impressions', 'views', 'watchTimeSeconds', 'likes', 'comments',
        'shares', 'saves', 'clicks', 'reach', 'followersGained', 'engagementRate', 'summary', 'source',
        'metricDate', 'lastSyncedAt', 'syncMeta'
      ];
      const set = {};
      for (const field of fields) if (row[field] !== undefined) set[field] = row[field];
      if (Object.keys(set).length) await Analytics.updateOne({ _id: collision._id }, { $set: set });
    }
    await Analytics.deleteOne({ _id: row._id });
    merged += 1;
  }
  return { remapped, merged };
}

async function remapAnalyticsSyncJobAccount(duplicateId, canonicalId) {
  const jobs = await AnalyticsSyncJob.find({ account: duplicateId }).lean();
  let remapped = 0;
  let merged = 0;
  for (const job of jobs) {
    const collision = await AnalyticsSyncJob.findOne({
      _id: { $ne: job._id }, post: job.post, account: canonicalId, platform: job.platform
    }).lean();
    if (!collision) {
      await AnalyticsSyncJob.updateOne({ _id: job._id }, { $set: { account: canonicalId } });
      remapped += 1;
      continue;
    }

    const candidateTime = new Date(job.lastSuccessAt || job.lastAttemptAt || job.updatedAt || 0).getTime() || 0;
    const collisionTime = new Date(collision.lastSuccessAt || collision.lastAttemptAt || collision.updatedAt || 0).getTime() || 0;
    if (candidateTime > collisionTime) {
      await AnalyticsSyncJob.updateOne(
        { _id: collision._id },
        {
          $set: {
            providerPostId: job.providerPostId || collision.providerPostId,
            originalProviderPostId: job.originalProviderPostId || collision.originalProviderPostId,
            status: job.status,
            nextAttemptAt: job.nextAttemptAt,
            attemptCount: Math.max(Number(job.attemptCount || 0), Number(collision.attemptCount || 0)),
            consecutiveFailures: Number(job.consecutiveFailures || 0),
            lastAttemptAt: job.lastAttemptAt,
            lastSuccessAt: job.lastSuccessAt,
            lastError: job.lastError || '',
            unsupportedReason: job.unsupportedReason || '',
            metadata: { ...(collision.metadata || {}), ...(job.metadata || {}), migration: { deduplicatedSocialAccountAt: new Date() } }
          }
        }
      );
    }
    await AnalyticsSyncJob.deleteOne({ _id: job._id });
    merged += 1;
  }
  return { remapped, merged };
}

async function remapSocialAccountReferences(duplicateId, canonicalId) {
  const summary = { posts: 0, campaigns: 0, analytics: 0, analyticsMerged: 0, analyticsJobs: 0, analyticsJobsMerged: 0 };

  const postAdd = await Post.updateMany({ targetAccounts: duplicateId }, { $addToSet: { targetAccounts: canonicalId } });
  await Post.updateMany({ targetAccounts: duplicateId }, { $pull: { targetAccounts: duplicateId } });
  summary.posts += Number(postAdd.modifiedCount || postAdd.nModified || 0);

  const variationUpdate = await Post.updateMany(
    { 'platformVariations.account': duplicateId },
    { $set: { 'platformVariations.$[item].account': canonicalId } },
    { arrayFilters: [{ 'item.account': duplicateId }] }
  );
  summary.posts += Number(variationUpdate.modifiedCount || variationUpdate.nModified || 0);

  const resultUpdate = await Post.updateMany(
    { 'publishResults.account': duplicateId },
    { $set: { 'publishResults.$[item].account': canonicalId } },
    { arrayFilters: [{ 'item.account': duplicateId }] }
  );
  summary.posts += Number(resultUpdate.modifiedCount || resultUpdate.nModified || 0);

  const campaignAdd = await Campaign.updateMany({ targetAccounts: duplicateId }, { $addToSet: { targetAccounts: canonicalId } });
  await Campaign.updateMany({ targetAccounts: duplicateId }, { $pull: { targetAccounts: duplicateId } });
  summary.campaigns += Number(campaignAdd.modifiedCount || campaignAdd.nModified || 0);

  const analytics = await remapAnalyticsAccount(duplicateId, canonicalId);
  summary.analytics += analytics.remapped;
  summary.analyticsMerged += analytics.merged;

  const analyticsJobs = await remapAnalyticsSyncJobAccount(duplicateId, canonicalId);
  summary.analyticsJobs += analyticsJobs.remapped;
  summary.analyticsJobsMerged += analyticsJobs.merged;
  return summary;
}

async function deduplicateSocialAccounts() {
  const accounts = await SocialAccount.find({ accountId: { $type: 'string', $ne: '' } })
    .select('_id brand owner platform accountId accountName status accessTokenEncrypted lastSyncAt createdAt updatedAt')
    .lean();
  const groups = new Map();
  for (const account of accounts) {
    const brandId = id(account.brand);
    const platform = String(account.platform || '').trim().toLowerCase();
    const accountId = String(account.accountId || '').trim();
    if (!brandId || !platform || !accountId) continue;
    const key = `${brandId}\u0000${platform}\u0000${accountId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(account);
  }

  const duplicateGroups = [...groups.values()].filter((rows) => rows.length > 1);
  const report = {
    groups: duplicateGroups.length,
    duplicateRows: duplicateGroups.reduce((sum, rows) => sum + rows.length - 1, 0),
    deleted: 0,
    references: { posts: 0, campaigns: 0, analytics: 0, analyticsMerged: 0, analyticsJobs: 0, analyticsJobsMerged: 0 }
  };
  if (!APPLY) return report;

  for (const rows of duplicateGroups) {
    const canonical = chooseCanonicalSocialAccount(rows);
    for (const duplicate of rows) {
      if (id(duplicate._id) === id(canonical._id)) continue;
      const refs = await remapSocialAccountReferences(duplicate._id, canonical._id);
      for (const key of Object.keys(report.references)) report.references[key] += Number(refs[key] || 0);
      await SocialAccount.deleteOne({ _id: duplicate._id });
      report.deleted += 1;
    }
  }
  return report;
}

async function purgeFabricatedAnalytics() {
  const query = { source: 'mock' };
  const count = await Analytics.countDocuments(query);
  if (APPLY && count) await Analytics.deleteMany(query);
  return { deleted: count };
}

async function invalidateMockMediaAndVideo() {
  const videoJobs = await AiVideoJob.find({
    $or: [
      { provider: { $regex: MOCK_PROVIDER } },
      { outputUrl: { $regex: 'mock\\.autobrand\\.local', $options: 'i' } }
    ]
  }).select('_id provider outputUrl status metadata').lean();
  const renderRows = await VideoRender.find({ outputUrl: { $regex: 'mock\\.autobrand\\.local', $options: 'i' } }).select('_id').lean();
  const mediaRows = await Media.find({ fileUrl: { $regex: 'mock\\.autobrand\\.local', $options: 'i' } }).select('_id').lean();

  if (APPLY) {
    if (videoJobs.length) {
      await AiVideoJob.updateMany(
        { _id: { $in: videoJobs.map((row) => row._id) } },
        {
          $set: {
            status: 'failed',
            errorMessage: 'Legacy mock video output invalidated. Render again with a configured real provider.',
            'metadata.migration.invalidatedMockAt': new Date()
          },
          $unset: { outputUrl: 1, outputMedia: 1, providerJobId: 1 }
        }
      );
    }
    if (renderRows.length) {
      await VideoRender.updateMany(
        { _id: { $in: renderRows.map((row) => row._id) } },
        { $set: { status: 'failed', errorMessage: 'Legacy mock video output invalidated. Render again with a real provider.' }, $unset: { outputUrl: 1 } }
      );
    }
    if (mediaRows.length) {
      await Media.updateMany(
        { _id: { $in: mediaRows.map((row) => row._id) } },
        { $set: { status: 'archived' } }
      );
    }
  }
  return { aiVideoJobsInvalidated: videoJobs.length, videoRendersInvalidated: renderRows.length, mediaArchived: mediaRows.length };
}


async function normalizeWorkspaceOwnedAssets() {
  const [growthAssets, avatars] = await Promise.all([
    GrowthAsset.find().select('_id brand owner createdBy').lean(),
    AvatarProfile.find().select('_id brand owner createdBy').lean()
  ]);
  const brandIds = [...new Set([...growthAssets, ...avatars].map((row) => id(row.brand)).filter(Boolean))];
  const brands = await Brand.find({ _id: { $in: brandIds } }).select('_id owner').lean();
  const owners = new Map(brands.map((brand) => [id(brand._id), brand.owner]));

  function operations(rows) {
    const ops = [];
    let orphaned = 0;
    for (const row of rows) {
      const workspaceOwner = owners.get(id(row.brand));
      if (!workspaceOwner) { orphaned += 1; continue; }
      const set = {};
      // Legacy rows used owner as the creating actor. Preserve that attribution before
      // normalizing owner to the actual brand/workspace owner.
      if (!row.createdBy && row.owner) set.createdBy = row.owner;
      if (id(row.owner) !== id(workspaceOwner)) set.owner = workspaceOwner;
      if (Object.keys(set).length) {
        ops.push({ updateOne: { filter: { _id: row._id }, update: { $set: set } } });
      }
    }
    return { ops, orphaned };
  }

  const growth = operations(growthAssets);
  const avatar = operations(avatars);
  if (APPLY && growth.ops.length) await GrowthAsset.bulkWrite(growth.ops, { ordered: false });
  if (APPLY && avatar.ops.length) await AvatarProfile.bulkWrite(avatar.ops, { ordered: false });
  return {
    growthAssets: { checked: growthAssets.length, updates: growth.ops.length, orphaned: growth.orphaned },
    avatarProfiles: { checked: avatars.length, updates: avatar.ops.length, orphaned: avatar.orphaned }
  };
}

async function normalizeSubscriptionCredits() {
  const rows = await Subscription.find({ $or: [{ creditsUsed: { $exists: false } }, { creditsUsed: null }, { creditsUsed: { $lt: 0 } }] })
    .select('_id creditsUsed metadata')
    .lean();
  const ops = rows.map((row) => ({
    updateOne: {
      filter: { _id: row._id },
      update: {
        $set: {
          creditsUsed: 0,
          'metadata.migration.creditPeriodNormalizedAt': new Date()
        }
      }
    }
  }));
  if (APPLY && ops.length) await Subscription.bulkWrite(ops, { ordered: false });
  return { checked: rows.length, normalized: ops.length };
}

async function backfillSubscriptionCommercialSnapshots() {
  const rows = await Subscription.find({
    $or: [
      { planSnapshot: { $exists: false } },
      { planSnapshot: null },
      { 'planSnapshot.slug': { $exists: false } },
      { aiTokensUsed: { $exists: false } },
      { aiTokensReserved: { $exists: false } },
      { aiTokenReservations: { $exists: false } }
    ]
  }).select('_id plan planRef planSnapshot aiTokensUsed aiTokensReserved aiTokenReservations metadata').lean();

  const planIds = [...new Set(rows.map((row) => id(row.planRef)).filter(Boolean))];
  const slugs = [...new Set(rows.map((row) => String(row.plan || '')).filter(Boolean))];
  const plans = await SubscriptionPlan.find({ $or: [{ _id: { $in: planIds } }, { slug: { $in: slugs } }] }).lean();
  const byId = new Map(plans.map((plan) => [id(plan._id), plan]));
  const bySlug = new Map(plans.map((plan) => [String(plan.slug), plan]));
  const ops = [];
  let unresolved = 0;

  for (const row of rows) {
    const plan = byId.get(id(row.planRef)) || bySlug.get(String(row.plan || ''));
    const set = {
      aiTokensUsed: Math.max(0, Number(row.aiTokensUsed || 0)),
      aiTokensReserved: 0,
      aiTokenReservations: [],
      'metadata.migration.tokenBudgetInitializedAt': new Date()
    };
    if (!row.planSnapshot?.slug) {
      if (!plan) {
        unresolved += 1;
      } else {
        set.planSnapshot = snapshotPlan(plan);
        set['metadata.migration.planSnapshotCapturedAt'] = new Date();
      }
    }
    ops.push({ updateOne: { filter: { _id: row._id }, update: { $set: set } } });
  }

  if (APPLY && ops.length) await Subscription.bulkWrite(ops, { ordered: false });
  return { checked: rows.length, updated: ops.length, unresolved };
}

async function backfillPaymentPlanSnapshots() {
  const rows = await Payment.find({
    $or: [
      { planSnapshot: { $exists: false } },
      { planSnapshot: null },
      { 'planSnapshot.slug': { $exists: false } }
    ],
    'metadata.plan': { $exists: true }
  }).select('_id amount currency metadata planSnapshot billingChange').lean();

  const slugs = [...new Set(rows.map((row) => String(row.metadata?.plan || '')).filter(Boolean))];
  const plans = await SubscriptionPlan.find({ slug: { $in: slugs } }).lean();
  const bySlug = new Map(plans.map((plan) => [String(plan.slug), plan]));
  const ops = [];
  let unresolved = 0;

  for (const row of rows) {
    const plan = bySlug.get(String(row.metadata?.plan || ''));
    if (!plan) {
      unresolved += 1;
      continue;
    }
    const snapshot = snapshotPlan(plan);
    // Preserve the amount actually charged for historical payment evidence while
    // retaining the plan's then-current entitlement matrix as best-effort legacy data.
    if (Number.isFinite(Number(row.metadata?.listPrice))) snapshot.price = Number(row.metadata.listPrice);
    const billingChange = row.billingChange || {
      kind: 'legacy',
      previousSubscriptionId: undefined,
      unusedCredit: 0,
      remainingFraction: 0,
      listPrice: Number(snapshot.price || row.amount || 0),
      amountDue: Number(row.amount || 0),
      calculatedAt: row.createdAt || new Date()
    };
    ops.push({ updateOne: { filter: { _id: row._id }, update: { $set: { planSnapshot: snapshot, billingChange } } } });
  }

  if (APPLY && ops.length) await Payment.bulkWrite(ops, { ordered: false });
  return { checked: rows.length, updated: ops.length, unresolved };
}




function legacyGridFsSignedUrl(value, fallbackName = 'media') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let pathname = raw;
  try { if (/^https?:\/\//i.test(raw)) pathname = new URL(raw).pathname; } catch (_error) { return ''; }
  if (SIGNED_GRIDFS_URL_PATTERN.test(pathname)) return '';
  const fileId = gridFsIdFromUrl(pathname);
  if (!fileId) return '';
  const segments = pathname.split('/').filter(Boolean);
  let filename = segments[segments.length - 1] || fallbackName;
  if (/^[a-f\d]{24}$/i.test(filename)) filename = fallbackName;
  try { filename = decodeURIComponent(filename); } catch (_error) {}
  return gridFsPublicUrl(fileId, filename || fallbackName);
}

async function signLegacyGridFsMediaUrls() {
  const report = { media: 0, mediaVariants: 0, brandAssets: 0, aiVideoJobs: 0, videoRenders: 0, total: 0 };
  const mediaRows = await Media.find({ $or: [
    { fileUrl: /\/uploads\/db\/[a-f\d]{24}/i },
    { 'variants.url': /\/uploads\/db\/[a-f\d]{24}/i }
  ] }).select('_id fileName fileUrl variants').lean();
  const mediaOps = [];
  for (const row of mediaRows) {
    const set = {};
    const signedFileUrl = legacyGridFsSignedUrl(row.fileUrl, row.fileName || 'media');
    if (signedFileUrl) { set.fileUrl = signedFileUrl; report.media += 1; }
    const variants = Array.isArray(row.variants) ? row.variants.map((variant) => {
      const signed = legacyGridFsSignedUrl(variant?.url, row.fileName || variant?.label || 'media');
      if (!signed) return variant;
      report.mediaVariants += 1;
      return { ...variant, url: signed };
    }) : [];
    if (report.mediaVariants && JSON.stringify(variants) !== JSON.stringify(row.variants || [])) set.variants = variants;
    if (Object.keys(set).length) mediaOps.push({ updateOne: { filter: { _id: row._id }, update: { $set: set } } });
  }
  if (APPLY && mediaOps.length) await Media.bulkWrite(mediaOps, { ordered: false });

  const assetRows = await BrandAsset.find({ url: /\/uploads\/db\/[a-f\d]{24}/i }).select('_id title url').lean();
  const assetOps = [];
  for (const row of assetRows) {
    const signed = legacyGridFsSignedUrl(row.url, row.title || 'asset');
    if (!signed) continue;
    report.brandAssets += 1;
    assetOps.push({ updateOne: { filter: { _id: row._id }, update: { $set: { url: signed, 'metadata.migration.gridFsUrlSignedAt': new Date() } } } });
  }
  if (APPLY && assetOps.length) await BrandAsset.bulkWrite(assetOps, { ordered: false });

  const videoRows = await AiVideoJob.find({ $or: [
    { outputUrl: /\/uploads\/db\/[a-f\d]{24}/i },
    { thumbnailUrl: /\/uploads\/db\/[a-f\d]{24}/i },
    { 'scenePlan.outputUrl': /\/uploads\/db\/[a-f\d]{24}/i }
  ] }).select('_id outputUrl thumbnailUrl scenePlan').lean();
  const videoOps = [];
  for (const row of videoRows) {
    const set = {};
    const outputUrl = legacyGridFsSignedUrl(row.outputUrl, 'video.mp4');
    const thumbnailUrl = legacyGridFsSignedUrl(row.thumbnailUrl, 'thumbnail.jpg');
    if (outputUrl) set.outputUrl = outputUrl;
    if (thumbnailUrl) set.thumbnailUrl = thumbnailUrl;
    const scenePlan = Array.isArray(row.scenePlan) ? row.scenePlan.map((scene) => {
      const signed = legacyGridFsSignedUrl(scene?.outputUrl, `scene-${scene?.order ?? 'media'}`);
      return signed ? { ...scene, outputUrl: signed } : scene;
    }) : [];
    if (JSON.stringify(scenePlan) !== JSON.stringify(row.scenePlan || [])) set.scenePlan = scenePlan;
    if (Object.keys(set).length) { report.aiVideoJobs += 1; videoOps.push({ updateOne: { filter: { _id: row._id }, update: { $set: set } } }); }
  }
  if (APPLY && videoOps.length) await AiVideoJob.bulkWrite(videoOps, { ordered: false });

  const renderRows = await VideoRender.find({ outputUrl: /\/uploads\/db\/[a-f\d]{24}/i }).select('_id outputUrl').lean();
  const renderOps = [];
  for (const row of renderRows) {
    const signed = legacyGridFsSignedUrl(row.outputUrl, 'video.mp4');
    if (!signed) continue;
    report.videoRenders += 1;
    renderOps.push({ updateOne: { filter: { _id: row._id }, update: { $set: { outputUrl: signed } } } });
  }
  if (APPLY && renderOps.length) await VideoRender.bulkWrite(renderOps, { ordered: false });
  report.total = report.media + report.mediaVariants + report.brandAssets + report.aiVideoJobs + report.videoRenders;
  return report;
}

async function disableLegacyLocalAiRouting() {
  const plans = await SubscriptionPlan.find({
    $or: [
      { 'aiConfig.allowedProviders': 'local' },
      { 'aiConfig.defaultTextProvider': 'local' },
      { 'aiConfig.defaultImageProvider': 'local' },
      { 'aiConfig.defaultVideoProvider': 'local' },
      { 'aiConfig.fallbackProvider': 'local' },
      { 'aiConfig.allowedModels': { $in: ['local-fast', 'local-fallback', 'local-image', 'local-storyboard'] } }
    ]
  }).select('_id aiConfig').lean();
  const planOps = plans.map((plan) => {
    const ai = plan.aiConfig || {};
    const allowedProviders = (ai.allowedProviders || []).filter((provider) => provider !== 'local');
    const allowedModels = (ai.allowedModels || []).filter((model) => !['local-fast', 'local-fallback', 'local-image', 'local-storyboard'].includes(model));
    const set = {
      'aiConfig.allowedProviders': allowedProviders,
      'aiConfig.allowedModels': allowedModels,
      'metadata.migration.localAiProviderDisabledAt': new Date()
    };
    for (const field of ['defaultTextProvider', 'defaultImageProvider', 'defaultVideoProvider', 'fallbackProvider']) {
      if (ai[field] === 'local') set[`aiConfig.${field}`] = '';
    }
    for (const field of ['defaultTextModel', 'defaultImageModel', 'defaultVideoModel', 'fallbackModel']) {
      if (['local-fast', 'local-fallback', 'local-image', 'local-storyboard'].includes(ai[field])) set[`aiConfig.${field}`] = '';
    }
    return { updateOne: { filter: { _id: plan._id }, update: { $set: set } } };
  });

  const taskConfigs = await PlanAiConfig.find({
    $or: [
      { allowedProviders: 'local' },
      { primaryProvider: 'local' },
      { fallbackProvider: 'local' },
      { allowedModels: { $in: ['local-fast', 'local-fallback', 'local-image', 'local-storyboard'] } },
      { primaryModel: { $in: ['local-fast', 'local-fallback', 'local-image', 'local-storyboard'] } },
      { fallbackModel: { $in: ['local-fast', 'local-fallback', 'local-image', 'local-storyboard'] } }
    ]
  }).select('_id allowedProviders allowedModels primaryProvider primaryModel fallbackProvider fallbackModel').lean();
  const configOps = taskConfigs.map((config) => {
    const set = {
      allowedProviders: (config.allowedProviders || []).filter((provider) => provider !== 'local'),
      allowedModels: (config.allowedModels || []).filter((model) => !['local-fast', 'local-fallback', 'local-image', 'local-storyboard'].includes(model))
    };
    if (config.primaryProvider === 'local') set.primaryProvider = '';
    if (config.fallbackProvider === 'local') set.fallbackProvider = '';
    if (['local-fast', 'local-fallback', 'local-image', 'local-storyboard'].includes(config.primaryModel)) set.primaryModel = '';
    if (['local-fast', 'local-fallback', 'local-image', 'local-storyboard'].includes(config.fallbackModel)) set.fallbackModel = '';
    return { updateOne: { filter: { _id: config._id }, update: { $set: set } } };
  });

  const providerRow = await AiProviderConfig.findOne({ slug: 'local' }).select('_id isActive isFallback').lean();
  if (APPLY) {
    if (planOps.length) await SubscriptionPlan.bulkWrite(planOps, { ordered: false });
    if (configOps.length) await PlanAiConfig.bulkWrite(configOps, { ordered: false });
    if (providerRow) {
      await AiProviderConfig.updateOne(
        { _id: providerRow._id },
        {
          $set: {
            isActive: false,
            isFallback: false,
            'metadata.migration.disabledAt': new Date(),
            'metadata.migration.reason': 'Deterministic local output is not a generative AI provider.'
          }
        }
      );
    }
  }
  return { plansNormalized: planOps.length, taskConfigsNormalized: configOps.length, localProviderDisabled: Boolean(providerRow) };
}


async function auditPaymentReferenceUniqueness() {
  const duplicates = await findPaymentReferenceDuplicates(Payment, 100);
  return {
    duplicateGroups: duplicates.length,
    duplicates: duplicates.map((row) => ({
      provider: row?._id?.provider ?? null,
      reference: row?._id?.reference ?? null,
      count: Number(row.count || 0),
      paymentIds: (row.paymentIds || []).map((value) => id(value))
    }))
  };
}

async function seedPaymentReconciliationState() {
  const rows = await Payment.find({
    provider: 'pesapal',
    status: { $in: ['pending', 'paid'] },
    $or: [
      { reconciliationStatus: { $exists: false } },
      { reconciliationStatus: 'idle' },
      { nextReconcileAt: { $exists: false } },
      { nextReconcileAt: null }
    ]
  }).select('_id reference providerReference metadata status').lean();

  const now = new Date();
  const ops = rows.map((payment, index) => {
    const trackingId = payment.providerReference || payment.metadata?.orderTrackingId || payment.metadata?.pesapal?.orderTrackingId;
    if (!trackingId) {
      return {
        updateOne: {
          filter: { _id: payment._id },
          update: {
            $set: {
              reconciliationStatus: 'exhausted',
              reconciliationError: 'Legacy Pesapal payment has no OrderTrackingId; manual finance review is required.',
              'metadata.migration.reconciliationSeededAt': now
            },
            $unset: { nextReconcileAt: 1, reconciliationLeaseUntil: 1, reconciliationLeaseOwner: 1 }
          }
        }
      };
    }
    return {
      updateOne: {
        filter: { _id: payment._id },
        update: {
          $set: {
            reconciliationStatus: 'scheduled',
            nextReconcileAt: new Date(now.getTime() + (index % 60) * 1000),
            reconciliationError: '',
            'metadata.migration.reconciliationSeededAt': now
          },
          $unset: { reconciliationLeaseUntil: 1, reconciliationLeaseOwner: 1 }
        }
      }
    };
  });
  if (APPLY && ops.length) await Payment.bulkWrite(ops, { ordered: false });
  return {
    checked: rows.length,
    scheduled: rows.filter((row) => Boolean(row.providerReference || row.metadata?.orderTrackingId || row.metadata?.pesapal?.orderTrackingId)).length,
    manualReview: rows.filter((row) => !Boolean(row.providerReference || row.metadata?.orderTrackingId || row.metadata?.pesapal?.orderTrackingId)).length
  };
}

async function enforceVerifiedPaidEntitlements() {
  const paidPlans = await SubscriptionPlan.find({ price: { $gt: 0 } }).select('_id slug').lean();
  const paidSlugs = paidPlans.map((plan) => plan.slug);
  const paidPlanIds = paidPlans.map((plan) => plan._id);
  if (!paidSlugs.length && !paidPlanIds.length) return { checked: 0, suspended: 0 };

  const subscriptions = await Subscription.find({
    status: { $in: ['active', 'trialing'] },
    $or: [{ plan: { $in: paidSlugs } }, { planRef: { $in: paidPlanIds } }]
  }).select('_id user plan metadata status').lean();

  const unsafe = [];
  for (const subscription of subscriptions) {
    const paymentId = subscription.metadata?.paymentId;
    let payment = null;
    if (paymentId) payment = await Payment.findById(paymentId).select('provider status metadata user').lean();
    if (!payment) {
      payment = await Payment.findOne({
        user: subscription.user,
        provider: 'pesapal',
        status: 'paid',
        'metadata.plan': subscription.plan,
        'metadata.integrity.valid': true,
        'metadata.lastVerifiedAt': { $exists: true }
      }).sort({ paidAt: -1, createdAt: -1 }).lean();
    }
    const verified = Boolean(
      payment
      && payment.provider === 'pesapal'
      && payment.status === 'paid'
      && payment.metadata?.integrity?.valid === true
      && payment.metadata?.lastVerifiedAt
    );
    if (!verified) unsafe.push(subscription);
  }

  if (APPLY && unsafe.length) {
    await Subscription.updateMany(
      { _id: { $in: unsafe.map((row) => row._id) } },
      {
        $set: {
          status: 'past_due',
          'metadata.migration.entitlementSuspendedAt': new Date(),
          'metadata.migration.entitlementSuspendedReason': 'No server-verified successful Pesapal payment could be linked to this paid entitlement.'
        }
      }
    );
  }
  return { checked: subscriptions.length, suspended: unsafe.length };
}

async function normalizePesapalReversalStatuses() {
  const rows = await Payment.find({ provider: 'pesapal', status: 'refunded' })
    .select('_id status reversedAt metadata updatedAt')
    .lean();
  const reversible = rows.filter((row) => {
    const providerMeta = row.metadata?.pesapal || {};
    const raw = providerMeta.status || {};
    const description = String(
      providerMeta.paymentStatusDescription
      || raw.payment_status_description
      || raw.payment_status
      || ''
    ).trim().toUpperCase();
    return description === 'REVERSED';
  });

  if (APPLY && reversible.length) {
    const ops = reversible.map((row) => ({
      updateOne: {
        filter: { _id: row._id, status: 'refunded' },
        update: {
          $set: {
            status: 'reversed',
            reversedAt: row.reversedAt || row.metadata?.lastVerifiedAt || row.updatedAt || new Date(),
            'metadata.migration.paymentStatusNormalizedAt': new Date(),
            'metadata.migration.paymentStatusNormalizedFrom': 'refunded'
          }
        }
      }
    }));
    await Payment.bulkWrite(ops, { ordered: false });
  }
  return { checked: rows.length, normalizedToReversed: reversible.length };
}

async function run() {
  // Migration must repair historical uniqueness collisions before the current
  // schema's unique indexes are created. Dry-run is strictly read-only.
  await connectDb({ ensureIndexes: false });
  const paymentReferenceUniqueness = await auditPaymentReferenceUniqueness();
  if (APPLY && paymentReferenceUniqueness.duplicateGroups > 0) {
    const error = new Error(
      `Migration stopped before making changes: ${paymentReferenceUniqueness.duplicateGroups} duplicate Payment provider/reference group(s) require finance review.`
    );
    error.code = 'EPAYMENTREFERENCEDUPLICATES';
    error.duplicates = paymentReferenceUniqueness.duplicates;
    throw error;
  }

  const report = {
    mode: APPLY ? 'apply' : 'dry-run',
    startedAt: new Date().toISOString(),
    paymentReferenceUniqueness,
    approvals: await backfillBrandForModel(Approval, 'Approval'),
    clientApprovalLinks: await backfillBrandForModel(ClientApprovalLink, 'ClientApprovalLink'),
    socialAccountDuplicates: await deduplicateSocialAccounts(),
    socialAccounts: await normalizeSocialAccountTenancy(),
    workspaceOwnedAssets: await normalizeWorkspaceOwnedAssets(),
    subscriptionCredits: await normalizeSubscriptionCredits(),
    subscriptionCommercialSnapshots: await backfillSubscriptionCommercialSnapshots(),
    paymentPlanSnapshots: await backfillPaymentPlanSnapshots(),
    signedGridFsUrls: await signLegacyGridFsMediaUrls(),
    aiRouting: await disableLegacyLocalAiRouting(),
    analytics: await purgeFabricatedAnalytics(),
    fakeVideoArtifacts: await invalidateMockMediaAndVideo(),
    billing: await enforceVerifiedPaidEntitlements(),
    paymentReconciliation: await seedPaymentReconciliationState(),
    paymentStatuses: await normalizePesapalReversalStatuses()
  };
  if (APPLY) {
    report.indexedModels = await ensureDatabaseIndexes();
    report.analyticsSyncSeed = await seedAnalyticsSyncJobs({ limit: 5000 });
  }
  report.completedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
  if (!APPLY) console.log('\nDry run only. Review the report and database backup, then rerun with --apply.');
}

run()
  .catch((error) => {
    console.error('Production data migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });

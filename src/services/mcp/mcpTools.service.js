const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const Brand = require('../../models/Brand');
const SocialAccount = require('../../models/SocialAccount');
const Media = require('../../models/Media');
const Post = require('../../models/Post');
const Analytics = require('../../models/Analytics');
const AuditLog = require('../../models/AuditLog');
const AiJob = require('../../models/AiJob');
const env = require('../../config/env');
const { accessibleBrandIds, assertBrandAccess, brandPermissions } = require('../authorization/brandAccess.service');
const { destinationReadiness, normalizePlatforms, resolvePublishingTargets } = require('../social/socialDestination.service');
const { downloadRemoteBuffer } = require('../remoteFetch.service');
const { persistGeneratedBuffer } = require('../generatedMediaPersistence.service');
const { publicMediaUrl } = require('../publicMediaUrlService');
const { buildMediaInsights } = require('../mediaInsightService');
const { assertCanCreateManualPost, assertCanSchedulePost, assertCanUseStorage, assertPlanFeature, SCHEDULED_POST_STATUSES } = require('../usageLimitService');
const { dispatchScheduledPost } = require('../postDispatchService');
const { sumMetrics } = require('../analytics/analyticsDashboard.service');
const googleDrive = require('../storage/googleDrive.service');
const { readMediaBuffer } = require('../storage/mediaBuffer.service');
const { applyAiBrainSettings } = require('../aiBrain/aiBrainSettings.service');
const { runBrainForBrand } = require('../aiBrain/aiBrainProcessor.service');

const SUPPORTED_PLATFORMS = new Set(['facebook','instagram','google_business','linkedin','pinterest','tiktok','youtube','x','threads']);

function asId(value) { return value?._id?.toString?.() || String(value || ''); }
function cleanString(value, max = 20000) { return String(value || '').trim().slice(0, max); }
function array(value) { return Array.isArray(value) ? value : value ? [value] : []; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function hashtags(value) {
  return unique(array(value).flatMap((v) => String(v || '').split(/[\s,]+/)).map((v) => v.trim()).filter(Boolean).map((v) => v.startsWith('#') ? v : `#${v}`));
}
function inferType(mediaRows = [], requested = '') {
  const type = String(requested || '').trim().toLowerCase();
  if (['text','image','carousel','video','reel','story','link','article','campaign'].includes(type)) return type;
  const images = mediaRows.filter((m) => m.fileType === 'image').length;
  const videos = mediaRows.filter((m) => m.fileType === 'video').length;
  if (videos) return 'video';
  if (images > 1) return 'carousel';
  if (images === 1) return 'image';
  return 'text';
}
function idempotencyKey(action, userId, input = {}) {
  if (input.clientRequestId) return `mcp:${action}:${cleanString(input.clientRequestId, 160)}`;
  const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const hash = crypto.createHash('sha256').update(JSON.stringify({ action, userId: String(userId), bucket, input })).digest('hex').slice(0, 40);
  return `mcp:${action}:${hash}`;
}
function postSummary(post) {
  return {
    id: asId(post._id), brandId: asId(post.brand?._id || post.brand), title: post.title || '', caption: post.caption || '',
    platforms: post.platforms?.length ? post.platforms : [post.platform].filter(Boolean), type: post.type, status: post.status,
    scheduledAt: post.scheduledAt || null, publishedAt: post.publishedAt || null, platformPostUrl: post.platformPostUrl || '',
    publishResults: (post.publishResults || []).map((r) => ({ platform: r.platform, accountName: r.accountName, status: r.status, platformPostId: r.platformPostId || '', platformPostUrl: r.platformPostUrl || '', errorMessage: r.errorMessage || '' })),
    errorMessage: post.errorMessage || '', createdAt: post.createdAt, updatedAt: post.updatedAt
  };
}
function mediaSummary(media) {
  return {
    id: asId(media._id), brandId: asId(media.brand?._id || media.brand), fileName: media.fileName || '',
    fileType: media.fileType || 'other', mimeType: media.mimeType || 'application/octet-stream', size: Number(media.size || 0),
    fileUrl: publicMediaUrl(media.fileUrl) || media.fileUrl || '', status: media.status || 'active',
    storageProvider: media.storageProvider || 'platform', externalProvider: media.externalProvider || '',
    driveFileId: media.externalProvider === 'google_drive' ? (media.externalFileId || '') : '',
    driveWebViewLink: media.externalProvider === 'google_drive' ? (media.externalWebViewLink || '') : '',
    tags: media.tags || [], createdAt: media.createdAt || null
  };
}
async function audit(user, action, entityType, entityId, metadata = {}) {
  await AuditLog.create({ user: user._id, action, entityType, entityId, metadata: { source: 'mcp', ...metadata } }).catch(() => {});
}
async function mediaRowsForBrand(user, brandId, mediaIds = []) {
  const ids = unique(array(mediaIds).map(String)).filter(mongoose.isValidObjectId);
  if (!ids.length) return [];
  await assertBrandAccess(user, brandId, 'content.create', { status: 'active' });
  const rows = await Media.find({ _id: { $in: ids }, brand: brandId, status: 'active' });
  if (rows.length !== ids.length) throw Object.assign(new Error('One or more media items are unavailable or belong to another brand.'), { status: 400 });
  return rows;
}
async function resolveTargets(user, brand, input, { allowEmpty = false } = {}) {
  const platforms = normalizePlatforms(input.platforms || []);
  if (array(input.platforms).length && platforms.length !== unique(array(input.platforms).map((p) => String(p).toLowerCase())).length) throw Object.assign(new Error('One or more requested platforms are unsupported.'), { status: 400 });
  return resolvePublishingTargets({ brandId: brand._id, requestedPlatforms: platforms, requestedAccountIds: input.accountIds || [], requireReady: true, allowPlatformDefaults: true, allowEmpty });
}
async function createPostRecord(user, input, mode) {
  const permission = mode === 'publish' ? 'content.publish' : mode === 'schedule' ? 'schedule.manage' : 'content.create';
  const brand = await assertBrandAccess(user, input.brandId, permission, { status: 'active' });
  await assertCanCreateManualPost(user, 1, brand._id);
  if (mode !== 'draft') await assertCanSchedulePost(user, 1, brand._id);
  const mediaRows = await mediaRowsForBrand(user, brand._id, input.mediaIds || []);
  const targets = await resolveTargets(user, brand, input, { allowEmpty: mode === 'draft' });
  const platforms = targets.platforms;
  const key = idempotencyKey(mode, user._id, input);
  const existing = await Post.findOne({ createdBy: user._id, brand: brand._id, idempotencyKey: key });
  if (existing) return { post: existing, reused: true };
  const scheduledAt = mode === 'publish' ? new Date() : mode === 'schedule' ? new Date(input.publishAt) : undefined;
  if (mode === 'schedule' && (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) throw Object.assign(new Error('publishAt must be a valid future ISO-8601 date/time.'), { status: 400 });
  const post = await Post.create({
    brand: brand._id,
    platform: platforms[0] || 'facebook',
    platforms,
    type: inferType(mediaRows, input.type),
    contentGoal: input.contentGoal || 'awareness',
    workflowMode: 'manual', contentSource: 'manual',
    title: cleanString(input.title || `${brand.name} post`, 240),
    caption: cleanString(input.text, 20000),
    hashtags: hashtags(input.hashtags), firstComment: cleanString(input.firstComment, 5000), altText: cleanString(input.altText, 2000),
    link: cleanString(input.link, 2000), media: mediaRows.map((m) => m._id), targetAccounts: targets.accountIds,
    status: mode === 'draft' ? 'draft' : 'scheduled', scheduledAt,
    scheduleVersion: mode === 'draft' ? 0 : 1, idempotencyKey: key, createdBy: user._id,
    platformMetadata: { source: 'mcp', requestedPlatforms: platforms, clientRequestId: input.clientRequestId || '', createdVia: 'ChatGPT/Codex MCP' }
  });
  if (mode !== 'draft') await dispatchScheduledPost(post, { userId: user._id });
  await audit(user, `mcp.post.${mode}`, 'Post', post._id, { brandId: String(brand._id), platforms });
  return { post, reused: false };
}
async function prepareExistingPost(user, postId, mode, publishAt) {
  if (!mongoose.isValidObjectId(postId)) throw Object.assign(new Error('Invalid postId.'), { status: 400 });
  const post = await Post.findById(postId);
  if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 });
  const permission = mode === 'publish' ? 'content.publish' : 'schedule.manage';
  await assertBrandAccess(user, post.brand, permission, { status: 'active' });
  await assertCanSchedulePost(user, SCHEDULED_POST_STATUSES.includes(post.status) ? 0 : 1, post.brand);
  await resolvePublishingTargets({ brandId: post.brand, requestedPlatforms: post.platforms?.length ? post.platforms : [post.platform], requestedAccountIds: post.targetAccounts || [], requireReady: true, allowPlatformDefaults: true, allowEmpty: false });
  if (['published','publishing','provider_processing'].includes(post.status)) throw Object.assign(new Error(`Post cannot be ${mode}ed while status is ${post.status}.`), { status: 409 });
  const activeGeneration = await AiJob.exists({ 'metadata.postId': String(post._id), taskType: { $in: ['post_content_generation','post_video_generation'] }, status: { $in: ['queued','running'] } });
  if (activeGeneration) throw Object.assign(new Error('Post generation is still running. Wait for generation to finish before publishing or scheduling.'), { status: 409 });
  const when = mode === 'publish' ? new Date() : new Date(publishAt);
  if (mode === 'schedule' && (!when || Number.isNaN(when.getTime()) || when.getTime() <= Date.now())) throw Object.assign(new Error('publishAt must be a valid future ISO-8601 date/time.'), { status: 400 });
  post.scheduledAt = when; post.status = 'scheduled'; post.scheduleVersion = Number(post.scheduleVersion || 0) + 1; post.publishingStartedAt = undefined; post.publishingAttemptId = ''; post.errorMessage = '';
  await post.save(); await dispatchScheduledPost(post, { userId: user._id });
  await audit(user, `mcp.post.${mode}_draft`, 'Post', post._id, { publishAt: when.toISOString() });
  return post;
}

async function getProfile(user) { return { id: String(user._id), name: user.name, email: user.email, nickname: `${user.name || user.email || 'User'} — AutoBrand AI` }; }
async function listBrands(user) {
  const ids = await accessibleBrandIds(user, 'brand.view', { status: 'active' });
  const brands = await Brand.find({ _id: { $in: ids }, status: 'active' }).sort({ name: 1 }).lean();
  return { brands: await Promise.all(brands.map(async (b) => ({ id: String(b._id), name: b.name, slug: b.slug, description: b.description || '', website: b.website || '', timezone: b.timezone, contentPillars: b.contentPillars || [], permissions: await brandPermissions(user, b._id) }))) };
}
async function getBrand(user, brandId) {
  const b = await assertBrandAccess(user, brandId, 'brand.view', { status: { $in: ['active','archived'] } });
  return { brand: { id: String(b._id), name: b.name, slug: b.slug, status: b.status, description: b.description || '', website: b.website || '', industry: b.industry || '', targetAudience: b.targetAudience || '', toneOfVoice: b.toneOfVoice || b.tone || '', contentPillars: b.contentPillars || [], preferredHashtags: b.preferredHashtags || [], brandColors: b.brandColors || [], fonts: b.fonts || [], timezone: b.timezone, approvalRequiredByDefault: b.approvalRequiredByDefault, aiBrain: b.aiBrain?.toObject?.() || b.aiBrain || {}, autoPosting: b.autoPosting?.toObject?.() || b.autoPosting || {}, permissions: await brandPermissions(user, b._id) } };
}
async function listConnectedAccounts(user, brandId) {
  const ids = brandId ? [(await assertBrandAccess(user, brandId, 'brand.view', { status: 'active' }))._id] : await accessibleBrandIds(user, 'brand.view');
  const rows = await SocialAccount.find({ brand: { $in: ids } }).sort({ brand: 1, platform: 1, accountName: 1 }).lean();
  return { accounts: rows.map((a) => { const readiness = destinationReadiness(a, { verifyEncryption: true }); return { id: String(a._id), brandId: String(a.brand), platform: a.platform, name: a.accountName, providerAccountId: a.accountId || '', status: a.status, healthStatus: a.healthStatus, readyToPublish: readiness.ready, blockers: readiness.blockers, capabilities: readiness.health?.capabilities || {}, permissions: a.permissions || [], lastSyncAt: a.lastSyncAt || null, lastPublishError: a.lastPublishError || '' }; }) };
}
async function uploadMedia(user, input) {
  const brand = await assertBrandAccess(user, input.brandId, 'content.create', { status: 'active' });
  const file = input.file || {};
  if (!file.download_url || !file.file_id) throw Object.assign(new Error('A ChatGPT file with download_url and file_id is required.'), { status: 400 });
  const downloaded = await downloadRemoteBuffer(file.download_url, { allowedMimePrefixes: ['image/','video/','audio/','application/pdf'], maxBytes: env.mcpMaxUploadBytes });
  const destination = ['platform','google_drive','both'].includes(String(input.storageDestination || '').toLowerCase())
    ? String(input.storageDestination).toLowerCase()
    : (user.assetStoragePreference || 'platform');
  if (destination !== 'google_drive') await assertCanUseStorage(user, downloaded.size, brand._id);
  if (destination !== 'platform') {
    await assertPlanFeature(user, 'googleDriveAccess', 'Google Drive asset storage', brand._id);
    await googleDrive.getConnection(user._id, { required: true });
  }

  const mimeType = file.mime_type || downloaded.mimeType || 'application/octet-stream';
  const fileType = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : mimeType === 'application/pdf' ? 'document' : 'other';
  const safeName = path.basename(cleanString(file.file_name || file.file_id, 220)).replace(/[\\/]+/g, '-') || 'mcp-upload';
  let media;
  let driveWarning = '';

  if (destination === 'google_drive') {
    media = await googleDrive.createDriveOnlyMedia({
      user, brand, buffer: downloaded.buffer, fileName: safeName, mimeType, fileType, size: downloaded.size,
      tags: ['mcp','chatgpt-upload']
    });
  } else {
    const persisted = await persistGeneratedBuffer({ buffer: downloaded.buffer, filename: safeName, mimeType, resourceType: fileType === 'video' ? 'video' : fileType === 'image' ? 'image' : 'raw', folder: `autobrand/${user._id}/${brand._id}/mcp`, metadata: { source: 'mcp', chatgptFileId: file.file_id, brandId: String(brand._id), userId: String(user._id) } });
    media = await Media.create({ brand: brand._id, uploadedBy: user._id, fileName: safeName, fileUrl: persisted.fileUrl, publicId: persisted.publicId || persisted.fileUrl, fileType, mimeType, size: downloaded.size, folder: persisted.storage || 'mcp', storageProvider: 'platform', tags: ['mcp','chatgpt-upload'], consentRequired: false, consentStatus: 'not_required' });
    if (destination === 'both') {
      try { await googleDrive.mirrorMediaToDrive({ user, brand, media, buffer: downloaded.buffer }); }
      catch (error) { driveWarning = `Platform copy saved, but Google Drive backup failed: ${error.message}`; }
    }
  }

  media.aiInsights = buildMediaInsights(media, brand); media.aiPrompt = media.aiInsights.visualPrompt; await media.save();
  await audit(user, 'mcp.media.uploaded', 'Media', media._id, { brandId: String(brand._id), fileId: file.file_id, storageDestination: destination, driveWarning });
  return { media: mediaSummary(media), storageDestination: destination, warning: driveWarning };
}

async function getStorageStatus(user) {
  const connection = await googleDrive.getConnection(user._id);
  return {
    preference: user.assetStoragePreference || 'platform',
    platformStorageAvailable: true,
    googleDriveConfigured: googleDrive.isConfigured(),
    googleDrive: googleDrive.summary(connection)
  };
}

async function listMedia(user, input = {}) {
  const brand = await assertBrandAccess(user, input.brandId, 'content.view', { status: { $in: ['active','archived'] } });
  const filter = { brand: brand._id, status: input.includeArchived ? { $in: ['active','archived'] } : { $ne: 'archived' } };
  if (input.fileType) filter.fileType = input.fileType;
  const rows = await Media.find(filter).sort({ createdAt: -1 }).limit(Math.min(100, Math.max(1, Number(input.limit || 30)))).lean();
  return { media: rows.map(mediaSummary) };
}

async function syncMediaToDrive(user, input) {
  const media = await Media.findById(input.mediaId).populate('brand');
  if (!media) throw Object.assign(new Error('Media not found.'), { status: 404 });
  await assertBrandAccess(user, media.brand?._id || media.brand, 'content.edit', { status: 'active' });
  await assertPlanFeature(user, 'googleDriveAccess', 'Google Drive asset storage', media.brand?._id || media.brand);
  if (media.externalProvider === 'google_drive' && media.externalFileId) return { media: mediaSummary(media), reused: true };
  await googleDrive.getConnection(user._id, { required: true });
  const source = await readMediaBuffer(media, { maxBytes: env.mcpMaxUploadBytes });
  await googleDrive.mirrorMediaToDrive({ user, brand: media.brand, media, buffer: source.buffer });
  await audit(user, 'mcp.media.synced_to_drive', 'Media', media._id, { brandId: String(media.brand._id) });
  return { media: mediaSummary(media), reused: false };
}

async function createDraft(user, input) { const r = await createPostRecord(user, input, 'draft'); return { reused: r.reused, post: postSummary(r.post) }; }
async function publishPost(user, input) { const r = await createPostRecord(user, input, 'publish'); return { reused: r.reused, queued: true, post: postSummary(r.post) }; }
async function schedulePost(user, input) { const r = await createPostRecord(user, input, 'schedule'); return { reused: r.reused, queued: true, post: postSummary(r.post) }; }
async function publishDraft(user, input) { const post = await prepareExistingPost(user, input.postId, 'publish'); return { queued: true, post: postSummary(post) }; }
async function scheduleDraft(user, input) { const post = await prepareExistingPost(user, input.postId, 'schedule', input.publishAt); return { queued: true, post: postSummary(post) }; }
async function updateDraft(user, input) {
  const post = await Post.findById(input.postId); if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 });
  await assertBrandAccess(user, post.brand, 'content.edit', { status: 'active' }); if (post.status !== 'draft') throw Object.assign(new Error('Only draft posts can be edited through update_draft.'), { status: 409 });
  if (input.text !== undefined) post.caption = cleanString(input.text, 20000); if (input.title !== undefined) post.title = cleanString(input.title, 240); if (input.hashtags !== undefined) post.hashtags = hashtags(input.hashtags); if (input.link !== undefined) post.link = cleanString(input.link, 2000);
  if (input.mediaIds !== undefined) { const rows = await mediaRowsForBrand(user, post.brand, input.mediaIds); post.media = rows.map((m) => m._id); post.type = inferType(rows, input.type || post.type); }
  if (input.platforms !== undefined || input.accountIds !== undefined) { const targets = await resolvePublishingTargets({ brandId: post.brand, requestedPlatforms: input.platforms || post.platforms || [post.platform], requestedAccountIds: input.accountIds || [], requireReady: true, allowPlatformDefaults: true, allowEmpty: true }); post.platforms = targets.platforms; post.platform = targets.platforms[0] || post.platform; post.targetAccounts = targets.accountIds; }
  await post.save(); await audit(user, 'mcp.post.draft_updated', 'Post', post._id, {}); return { post: postSummary(post) };
}
async function listPosts(user, input = {}) {
  const ids = input.brandId ? [(await assertBrandAccess(user, input.brandId, 'content.view', { status: { $in: ['active','archived'] } }))._id] : await accessibleBrandIds(user, 'content.view', { status: '' });
  const filter = { brand: { $in: ids } }; if (input.status) filter.status = input.status; const rows = await Post.find(filter).sort({ createdAt: -1 }).limit(Math.min(100, Math.max(1, Number(input.limit || 25)))); return { posts: rows.map(postSummary) };
}
async function getPost(user, postId) { const post = await Post.findById(postId); if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 }); await assertBrandAccess(user, post.brand, 'content.view', { status: { $in: ['active','archived'] } }); return { post: postSummary(post) }; }
async function listScheduledPosts(user, input = {}) { return listPosts(user, { ...input, status: 'scheduled' }); }
async function cancelScheduledPost(user, postId) { const post = await Post.findById(postId); if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 }); await assertBrandAccess(user, post.brand, 'schedule.manage', { status: 'active' }); if (!['scheduled','pending_approval','draft'].includes(post.status)) throw Object.assign(new Error(`Post status ${post.status} cannot be cancelled.`), { status: 409 }); post.status='cancelled'; post.scheduleVersion=Number(post.scheduleVersion||0)+1; post.publishingStartedAt=undefined; post.publishingAttemptId=''; await post.save(); await audit(user,'mcp.post.cancelled','Post',post._id,{}); return { post: postSummary(post) }; }
async function getAiBrain(user, brandId) {
  const brand = await assertBrandAccess(user, brandId, 'brand.view', { status: 'active' });
  return { brandId: String(brand._id), brandName: brand.name, aiBrain: brand.aiBrain?.toObject?.() || brand.aiBrain || {}, autoPosting: brand.autoPosting?.toObject?.() || brand.autoPosting || {} };
}
async function updateAiBrain(user, input) {
  const brand = await assertBrandAccess(user, input.brandId, 'brand.manage', { status: 'active' });
  if (input.frequencyUnit !== undefined || input.postsPerDay !== undefined || input.postsPerWeek !== undefined || input.postsPerMonth !== undefined || input.preferredSlots !== undefined || input.mediaMix !== undefined) {
    brand.autoPosting = {
      ...(brand.autoPosting?.toObject?.() || brand.autoPosting || {}),
      ...(input.frequencyUnit !== undefined ? { frequencyUnit: input.frequencyUnit } : {}),
      ...(input.postsPerDay !== undefined ? { postsPerDay: input.postsPerDay } : {}),
      ...(input.postsPerWeek !== undefined ? { postsPerWeek: input.postsPerWeek } : {}),
      ...(input.postsPerMonth !== undefined ? { postsPerMonth: input.postsPerMonth } : {}),
      ...(input.preferredSlots !== undefined ? { preferredSlots: input.preferredSlots } : {}),
      ...(input.mediaMix !== undefined ? { mediaMix: input.mediaMix } : {})
    };
  }
  const brainInput = { ...input }; delete brainInput.brandId; delete brainInput.frequencyUnit; delete brainInput.postsPerDay; delete brainInput.postsPerWeek; delete brainInput.postsPerMonth; delete brainInput.preferredSlots; delete brainInput.mediaMix;
  await applyAiBrainSettings({ user, brand, input: brainInput });
  await audit(user, 'mcp.ai_brain.updated', 'Brand', brand._id, { operatingMode: brand.aiBrain.operatingMode, contentSource: brand.aiBrain.contentSource });
  return getAiBrain(user, brand._id);
}
async function runAiBrainNow(user, brandId) {
  const brand = await assertBrandAccess(user, brandId, 'content.publish', { status: 'active' });
  const result = await runBrainForBrand(brand);
  await audit(user, 'mcp.ai_brain.ran', 'Brand', brand._id, result || {});
  return result || { brandId: String(brand._id), skipped: true };
}

async function getAnalyticsSummary(user, input) { const brand = await assertBrandAccess(user, input.brandId, 'analytics.view', { status: { $in: ['active','archived'] } }); const filter={ brand: brand._id, recordKind:'lifetime' }; const platforms=normalizePlatforms(input.platforms||[]); if(platforms.length) filter.platform={$in:platforms}; if(input.from||input.to){ filter.metricDate={}; if(input.from) filter.metricDate.$gte=new Date(`${input.from}T00:00:00.000Z`); if(input.to) filter.metricDate.$lte=new Date(`${input.to}T23:59:59.999Z`); } let rows=await Analytics.find(filter).populate('post','title caption').lean(); if(!rows.length){ delete filter.recordKind; filter.recordKind='daily'; rows=await Analytics.find(filter).populate('post','title caption').lean(); } const totals=sumMetrics(rows); const top=[...rows].sort((a,b)=>(Number(b.engagementRate)||0)-(Number(a.engagementRate)||0)).slice(0,10).map((r)=>({ platform:r.platform, postId:asId(r.post?._id||r.post), title:r.post?.title||r.post?.caption||'', impressions:r.impressions||0, reach:r.reach||0, views:r.views||0, likes:r.likes||0, comments:r.comments||0, shares:r.shares||0, clicks:r.clicks||0, engagementRate:r.engagementRate||0, metricDate:r.metricDate })); return { brandId:String(brand._id), brandName:brand.name, platforms, range:{from:input.from||null,to:input.to||null}, recordCount:rows.length, totals, topPosts:top }; }

module.exports={ getProfile,listBrands,getBrand,listConnectedAccounts,getStorageStatus,listMedia,syncMediaToDrive,uploadMedia,createDraft,updateDraft,publishPost,publishDraft,schedulePost,scheduleDraft,listPosts,getPost,listScheduledPosts,cancelScheduledPost,getAiBrain,updateAiBrain,runAiBrainNow,getAnalyticsSummary,SUPPORTED_PLATFORMS };

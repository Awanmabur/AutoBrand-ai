const Brand = require('../models/Brand');
const Campaign = require('../models/Campaign');
const Post = require('../models/Post');
const { buildCampaignPlan, splitPlatforms } = require('../services/campaignPlannerService');
const { SCHEDULED_POST_STATUSES, assertCanSchedulePost, assertPlanPageAccess } = require('../services/usageLimitService');
const { dispatchScheduledPost } = require('../services/postDispatchService');
const { buildPostGenerationPlan, enqueuePostGeneration } = require('../services/postGeneration.service');
const { zonedDateForDayOffset } = require('../utils/timeZone');
const { resolvePublishingTargets, stringId } = require('../services/social/socialDestination.service');

function postTypeForIdea(idea = {}) {
  if (idea.type) return idea.type;
  if (idea.platform === 'youtube' || idea.platform === 'tiktok') return 'reel';
  if (idea.platform === 'instagram') return 'image';
  return 'text';
}

function postContentGoal(campaignType = 'awareness') {
  const map = {
    leads: 'lead_generation',
    product_launch: 'launch',
    event_promotion: 'event',
    offer_sale: 'sales',
    brand_growth: 'community'
  };
  return map[campaignType] || campaignType || 'awareness';
}

function ideaKey(idea = {}) {
  return [idea.day || '', idea.platform || '', idea.title || idea.caption || ''].join('|').toLowerCase();
}

function campaignIdeas(campaign = {}) {
  return campaign.aiPlan?.postIdeas?.length
    ? campaign.aiPlan.postIdeas
    : campaign.aiPlan?.weeklyPlan || [];
}

function parseTimeHint(value = '8:00 AM') {
  const match = String(value || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return { hour: 8, minute: 0 };
  let hour = Number(match[1] || 8);
  const minute = Number(match[2] || 0);
  const suffix = String(match[3] || '').toLowerCase();
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  return { hour, minute };
}

function scheduledAtForIdea(campaign, idea, index = 0) {
  const start = campaign.startDate ? new Date(campaign.startDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const day = Math.max(1, Number(idea.day || index + 1));
  const times = campaign.aiPlan?.suggestedTimes || ['8:00 AM', '1:00 PM', '7:00 PM'];
  const { hour, minute } = parseTimeHint(idea.bestTimeHint || times[index % times.length]);
  return zonedDateForDayOffset({ date: start, dayOffset: day - 1, hour, minute });
}

function mediaPresetForPostType(type) {
  if (type === 'video' || type === 'reel') return 'video';
  if (type === 'carousel') return 'carousel-3';
  if (type === 'image' || type === 'story') return 'image-1';
  return 'text';
}

function generationBodyForCampaignPost(post, idea = {}) {
  const type = post.type || postTypeForIdea(idea);
  const mediaPreset = mediaPresetForPostType(type);
  return {
    creationMode: 'manual',
    action: 'schedule',
    title: post.title || '',
    description: post.description || '',
    caption: post.caption || '',
    hashtags: post.hashtags || [],
    platform: post.platform || 'facebook',
    platforms: post.platforms?.length ? post.platforms : [post.platform || 'facebook'],
    type,
    mediaPreset,
    mediaFormat: mediaPreset === 'video'
      ? 'short_video'
      : mediaPreset.startsWith('carousel')
        ? 'carousel_slides'
        : mediaPreset.startsWith('image')
          ? 'text_image'
          : 'text_only',
    imageCount: mediaPreset.startsWith('carousel') ? 3 : mediaPreset.startsWith('image') ? 1 : 0,
    generateImage: mediaPreset.startsWith('image') || mediaPreset.startsWith('carousel') ? 'on' : undefined,
    contentType: idea.contentType || 'promo',
    goal: idea.creativeDirection || post.description || post.caption || ''
  };
}

async function prepareCampaignPostForSchedule({ post, campaign, idea, userId, scheduledAt }) {
  const selectedMediaRows = Array.isArray(post.media)
    ? post.media.filter((item) => item && typeof item === 'object' && item.fileType)
    : [];
  const body = generationBodyForCampaignPost(post, idea);
  const plan = buildPostGenerationPlan(body, selectedMediaRows, campaign.brand);

  if (plan.needsGeneration) {
    post.status = 'draft';
    post.scheduledAt = scheduledAt;
    post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
    post.publishingStartedAt = undefined;
    post.publishingAttemptId = '';
    post.platformMetadata = {
      ...(post.platformMetadata || {}),
      generation: {
        status: 'queued',
        stage: 'queued',
        requestedAction: 'schedule',
        queuedAt: new Date(),
        error: ''
      }
    };
    await post.save();
    await enqueuePostGeneration({
      post,
      brand: campaign.brand,
      userId,
      body,
      selectedMediaIds: selectedMediaRows.map((media) => media._id),
      plan,
      requestedAction: 'schedule',
      scheduledAt
    });
    return post;
  }

  post.status = 'scheduled';
  post.scheduledAt = scheduledAt;
  post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
  post.publishingStartedAt = undefined;
  post.publishingAttemptId = '';
  await post.save();
  await dispatchScheduledPost(post, { userId });
  return post;
}

function campaignTargetIdsForPlatform(campaign, platform) {
  return (campaign.targetAccounts || [])
    .filter((account) => !account?.platform || account.platform === platform)
    .map((account) => account?._id || account)
    .filter(Boolean);
}

function postPayloadFromIdea({ campaign, idea, userId, status = 'draft', scheduledAt }) {
  return {
    brand: campaign.brand._id || campaign.brand,
    campaign: campaign._id,
    platform: idea.platform || campaign.platforms?.[0] || 'facebook',
    platforms: [idea.platform || campaign.platforms?.[0] || 'facebook'],
    targetAccounts: campaignTargetIdsForPlatform(campaign, idea.platform || campaign.platforms?.[0] || 'facebook'),
    type: postTypeForIdea(idea),
    contentGoal: postContentGoal(campaign.aiPlan?.campaignType),
    title: idea.title || `${campaign.name} day ${idea.day || ''}`.trim(),
    description: idea.creativeDirection || campaign.description || '',
    caption: idea.caption || campaign.description || campaign.goal || campaign.name,
    hashtags: idea.hashtags?.length ? idea.hashtags : campaign.aiPlan?.hashtags || campaign.brand.preferredHashtags || [],
    link: idea.link || '',
    status,
    scheduledAt,
    scheduleVersion: status === 'scheduled' ? 1 : 0,
    validationWarnings: [],
    platformMetadata: {
      campaignPlanDay: idea.day,
      campaignContentType: idea.contentType,
      creativeDirection: idea.creativeDirection,
      bestTimeHint: idea.bestTimeHint,
      campaignStrategy: campaign.aiPlan?.strategy || {}
    },
    createdBy: userId
  };
}

async function index(req, res) {
  return res.redirect(303, '/dashboard/campaigns');
}

async function store(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await assertPlanPageAccess(req.user, 'campaigns', 'campaign planning');

    const requestedPlatforms = splitPlatforms(req.body.platforms);
    const targets = await resolvePublishingTargets({
      ownerId: req.user._id,
      brandId: brand._id,
      requestedPlatforms,
      requestedAccountIds: req.body.targetAccounts || [],
      requireReady: true
    });
    const platforms = targets.platforms;
    const aiPlan = buildCampaignPlan({
      brand,
      goal: req.body.goal,
      campaignType: req.body.campaignType,
      platforms,
      durationDays: req.body.durationDays
    });

    await Campaign.create({
      brand: brand._id,
      createdBy: req.user._id,
      name: req.body.name,
      goal: req.body.goal,
      description: req.body.description,
      platforms,
      targetAccounts: targets.accountIds,
      postingFrequency: req.body.postingFrequency,
      startDate: req.body.startDate || undefined,
      endDate: req.body.endDate || undefined,
      status: 'draft',
      aiPlan
    });

    res.redirect('/dashboard/campaigns');
  } catch (error) {
    if (error.code === 'PUBLISHING_TARGETS_UNAVAILABLE') return res.redirect(`/dashboard/campaigns?error=${encodeURIComponent(error.message)}`);
    next(error);
  }
}

async function createDrafts(req, res, next) {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, createdBy: req.user._id }).populate('brand').populate('targetAccounts');
    if (!campaign) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await assertPlanPageAccess(req.user, 'campaigns', 'campaign planning');

    const existing = await Post.find({ campaign: campaign._id, createdBy: req.user._id }).select('title platform platformMetadata').lean();
    const existingKeys = new Set(existing.map((post) => ideaKey({
      day: post.platformMetadata?.campaignPlanDay,
      platform: post.platform,
      title: post.title
    })));
    const drafts = campaignIdeas(campaign)
      .filter((idea) => !existingKeys.has(ideaKey(idea)))
      .map((idea) => postPayloadFromIdea({ campaign, idea, userId: req.user._id }));

    if (drafts.length) await Post.insertMany(drafts);
    res.redirect('/dashboard/content-library');
  } catch (error) {
    next(error);
  }
}

async function scheduleCampaign(req, res, next) {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, createdBy: req.user._id }).populate('brand').populate('targetAccounts');
    if (!campaign) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await assertPlanPageAccess(req.user, 'campaigns', 'campaign planning');

    const targets = await resolvePublishingTargets({
      ownerId: req.user._id,
      brandId: campaign.brand._id,
      requestedPlatforms: campaign.platforms,
      requestedAccountIds: (campaign.targetAccounts || []).map(stringId),
      requireReady: true
    });
    campaign.platforms = targets.platforms;
    campaign.targetAccounts = targets.accountIds;
    await campaign.save();
    await campaign.populate('targetAccounts');

    const ideas = campaignIdeas(campaign).filter((idea) => targets.platforms.includes(idea.platform || targets.platforms[0]));
    const existingPosts = await Post.find({ campaign: campaign._id, createdBy: req.user._id })
      .populate('media')
      .sort({ createdAt: 1 });
    const alreadyScheduled = existingPosts.filter((post) => SCHEDULED_POST_STATUSES.includes(post.status)).length;
    const requestedScheduled = Math.max(0, ideas.length - alreadyScheduled);
    if (requestedScheduled) await assertCanSchedulePost(req.user, requestedScheduled);
    const updates = [];

    for (const [index, idea] of ideas.entries()) {
      const scheduledAt = scheduledAtForIdea(campaign, idea, index);
      const existing = existingPosts[index];
      if (existing) {
        existing.platform = idea.platform || targets.platforms[0];
        existing.platforms = [existing.platform];
        existing.targetAccounts = campaignTargetIdsForPlatform(campaign, existing.platform);
        existing.platformMetadata = {
          ...(existing.platformMetadata || {}),
          campaignPlanDay: idea.day,
          campaignContentType: idea.contentType,
          creativeDirection: idea.creativeDirection,
          bestTimeHint: idea.bestTimeHint,
          campaignStrategy: campaign.aiPlan?.strategy || {}
        };
        updates.push(prepareCampaignPostForSchedule({
          post: existing,
          campaign,
          idea,
          userId: req.user._id,
          scheduledAt
        }));
      } else {
        updates.push(Post.create(postPayloadFromIdea({
          campaign,
          idea,
          userId: req.user._id,
          status: 'draft',
          scheduledAt
        })).then((post) => prepareCampaignPostForSchedule({
          post,
          campaign,
          idea,
          userId: req.user._id,
          scheduledAt
        })));
      }
    }

    await Promise.all(updates);
    campaign.status = 'active';
    await campaign.save();
    res.redirect('/dashboard/calendar?notice=Campaign%20scheduled');
  } catch (error) {
    if (error.code === 'PUBLISHING_TARGETS_UNAVAILABLE') return res.redirect(`/dashboard/campaigns?error=${encodeURIComponent(error.message)}`);
    next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!campaign) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    campaign.status = req.body.status;
    await campaign.save();
    res.redirect('/dashboard/campaigns');
  } catch (error) {
    next(error);
  }
}

module.exports = { createDrafts, index, scheduleCampaign, store, updateStatus };

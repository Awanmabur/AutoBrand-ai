const Brand = require('../models/Brand');
const Campaign = require('../models/Campaign');
const Post = require('../models/Post');
const { buildCampaignPlan, splitPlatforms } = require('../services/campaignPlannerService');
const { SCHEDULED_POST_STATUSES, assertCanSchedulePost, assertPlanPageAccess } = require('../services/usageLimitService');

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
  const date = new Date(start);
  date.setDate(start.getDate() + day - 1);
  const times = campaign.aiPlan?.suggestedTimes || ['8:00 AM', '1:00 PM', '7:00 PM'];
  const { hour, minute } = parseTimeHint(idea.bestTimeHint || times[index % times.length]);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function postPayloadFromIdea({ campaign, idea, userId, status = 'draft', scheduledAt }) {
  return {
    brand: campaign.brand._id || campaign.brand,
    campaign: campaign._id,
    platform: idea.platform || campaign.platforms?.[0] || 'facebook',
    platforms: [idea.platform || campaign.platforms?.[0] || 'facebook'],
    type: postTypeForIdea(idea),
    contentGoal: postContentGoal(campaign.aiPlan?.campaignType),
    title: idea.title || `${campaign.name} day ${idea.day || ''}`.trim(),
    description: idea.creativeDirection || campaign.description || '',
    caption: idea.caption || campaign.description || campaign.goal || campaign.name,
    hashtags: idea.hashtags?.length ? idea.hashtags : campaign.aiPlan?.hashtags || campaign.brand.preferredHashtags || [],
    link: idea.link || '',
    status,
    scheduledAt,
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

    const platforms = splitPlatforms(req.body.platforms);
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
      postingFrequency: req.body.postingFrequency,
      startDate: req.body.startDate || undefined,
      endDate: req.body.endDate || undefined,
      status: 'draft',
      aiPlan
    });

    res.redirect('/dashboard/campaigns');
  } catch (error) {
    next(error);
  }
}

async function createDrafts(req, res, next) {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, createdBy: req.user._id }).populate('brand');
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
    const campaign = await Campaign.findOne({ _id: req.params.id, createdBy: req.user._id }).populate('brand');
    if (!campaign) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await assertPlanPageAccess(req.user, 'campaigns', 'campaign planning');

    const ideas = campaignIdeas(campaign);
    const existingPosts = await Post.find({ campaign: campaign._id, createdBy: req.user._id })
      .sort({ createdAt: 1 });
    const alreadyScheduled = existingPosts.filter((post) => SCHEDULED_POST_STATUSES.includes(post.status)).length;
    const requestedScheduled = Math.max(0, ideas.length - alreadyScheduled);
    if (requestedScheduled) await assertCanSchedulePost(req.user, requestedScheduled);
    const updates = [];

    for (const [index, idea] of ideas.entries()) {
      const scheduledAt = scheduledAtForIdea(campaign, idea, index);
      const existing = existingPosts[index];
      if (existing) {
        existing.status = 'scheduled';
        existing.scheduledAt = scheduledAt;
        existing.platformMetadata = {
          ...(existing.platformMetadata || {}),
          campaignPlanDay: idea.day,
          campaignContentType: idea.contentType,
          creativeDirection: idea.creativeDirection,
          bestTimeHint: idea.bestTimeHint,
          campaignStrategy: campaign.aiPlan?.strategy || {}
        };
        updates.push(existing.save());
      } else {
        updates.push(Post.create(postPayloadFromIdea({
          campaign,
          idea,
          userId: req.user._id,
          status: 'scheduled',
          scheduledAt
        })));
      }
    }

    await Promise.all(updates);
    campaign.status = 'active';
    await campaign.save();
    res.redirect('/dashboard/calendar?notice=Campaign%20scheduled');
  } catch (error) {
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

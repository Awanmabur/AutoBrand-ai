const Brand = require('../models/Brand');
const Campaign = require('../models/Campaign');
const Media = require('../models/Media');
const Post = require('../models/Post');
const AiVideoJob = require('../models/AiVideoJob');
const GrowthAsset = require('../models/GrowthAsset');
const {
  adCopyPack,
  brandAudit,
  campaignBrief,
  carouselIdeaGenerator,
  contentIdeas,
  contentPlanAsset,
  competitorSnapshot,
  draftBatch,
  draftsFromGrowthAsset,
  hookGenerator,
  makeHashtags,
  offerAngles,
  reelScriptGenerator,
  videoStoryboard
} = require('../services/growthStudioService');
const { applyMediaToScenes, mediaContext } = require('../services/mediaInsightService');
const { assertCanCreateVideo, assertPlanPageAccess } = require('../services/usageLimitService');
const { resolvePublishingTargets } = require('../services/social/socialDestination.service');

function targetIdsForPlatform(targets, platform) {
  return (targets?.byPlatform?.[platform] || []).map((account) => account._id);
}

function withResolvedTargets(draft, targets) {
  const platform = draft.platform || draft.platforms?.[0] || targets.platforms[0];
  return {
    ...draft,
    platform,
    platforms: [platform],
    targetAccounts: targetIdsForPlatform(targets, platform)
  };
}

async function index(req, res) {
  return res.redirect(303, '/dashboard/campaigns');
}

async function saveGrowthAsset({ req, brand, commonAsset, type, payload, campaignGoal, sourceMedia, mediaNote, targets }) {
  const asset = await GrowthAsset.create({ ...commonAsset, type, ...payload });
  const saveTarget = String(req.body.saveTarget || 'asset');

  if (saveTarget === 'drafts') {
    const drafts = draftsFromGrowthAsset({ asset, brand, platforms: targets.platforms }).map((draft) => ({
      ...withResolvedTargets(draft, targets),
      caption: `${draft.caption}${mediaNote || ''}`,
      media: sourceMedia ? [sourceMedia._id] : [],
      platformMetadata: {
        ...(draft.platformMetadata || {}),
        sourceMedia: sourceMedia?._id,
        mediaPrompt: sourceMedia?.aiPrompt,
        mediaInsights: sourceMedia?.aiInsights
      },
      createdBy: req.user._id
    }));
    if (drafts.length) await Post.insertMany(drafts);
    return { redirect: '/dashboard/content-library?created=growth_drafts' };
  }

  if (saveTarget === 'campaign') {
    await Campaign.create({
      ...campaignBrief({
        brand,
        campaignGoal: campaignGoal || payload.summary || asset.title,
        platforms: targets.platforms,
        durationDays: type === 'monthly_content_plan' ? 30 : 7
      }),
      name: asset.title,
      description: asset.summary,
      brand: brand._id,
      createdBy: req.user._id,
      targetAccounts: targets.accountIds
    });
    return { redirect: '/dashboard/campaigns?created=growth_campaign' };
  }

  return { redirect: `/dashboard/campaigns?created=${encodeURIComponent(type)}` };
}

async function run(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await assertPlanPageAccess(req.user, 'campaigns', 'Growth Studio workflows');

    const targets = await resolvePublishingTargets({
      ownerId: req.user._id,
      brandId: brand._id,
      requestedPlatforms: req.body.platforms,
      requestedAccountIds: req.body.targetAccounts || [],
      requireReady: true
    });
    req.body.platforms = targets.platforms;

    const campaignGoal = req.body.campaignGoal;
    const action = req.body.actionType;
    const commonAsset = { owner: req.user._id, brand: brand._id };
    const sourceMedia = req.body.sourceMedia ? await Media.findOne({ _id: req.body.sourceMedia, uploadedBy: req.user._id, brand: brand._id }) : null;
    const mediaNote = sourceMedia ? `\n\nUse uploaded media: ${mediaContext(sourceMedia)}` : '';

    if (action === 'campaign_brief') {
      await Campaign.create({
        ...campaignBrief({ brand, campaignGoal, platforms: targets.platforms }),
        brand: brand._id,
        createdBy: req.user._id,
        targetAccounts: targets.accountIds
      });
      return res.redirect('/dashboard/campaigns?created=campaign');
    }

    if (action === 'draft_batch') {
      const drafts = draftBatch({ brand, campaignGoal, platforms: targets.platforms }).map((draft) => ({
        ...withResolvedTargets(draft, targets),
        caption: `${draft.caption}${mediaNote}`,
        media: sourceMedia ? [sourceMedia._id] : [],
        platformMetadata: sourceMedia ? { sourceMedia: sourceMedia._id, mediaPrompt: sourceMedia.aiPrompt, mediaInsights: sourceMedia.aiInsights } : {},
        createdBy: req.user._id
      }));
      await Post.insertMany(drafts);
      return res.redirect('/dashboard/campaigns?created=drafts');
    }

    if (action === 'video_storyboard') {
      await assertCanCreateVideo(req.user);
      const storyboard = videoStoryboard({ brand, campaignGoal, platform: targets.platforms[0], style: req.body.style });
      await AiVideoJob.create({
        ...storyboard,
        scenePlan: applyMediaToScenes(storyboard.scenePlan, sourceMedia ? [sourceMedia] : []),
        sourceMedia: sourceMedia ? [sourceMedia._id] : [],
        brand: brand._id,
        createdBy: req.user._id
      });
      return res.redirect('/dashboard/campaigns?created=video');
    }

    if (action === 'brand_audit') {
      const result = await saveGrowthAsset({
        req,
        brand,
        commonAsset,
        type: 'brand_audit',
        payload: brandAudit(brand),
        campaignGoal,
        sourceMedia,
        mediaNote,
        targets
      });
      return res.redirect(result.redirect);
    }

    if (action === 'competitor_snapshot') {
      const result = await saveGrowthAsset({
        req,
        brand,
        commonAsset,
        type: 'competitor_snapshot',
        payload: competitorSnapshot(brand, campaignGoal),
        campaignGoal,
        sourceMedia,
        mediaNote,
        targets
      });
      return res.redirect(result.redirect);
    }

    if (action === 'offer_angles') {
      const result = await saveGrowthAsset({
        req,
        brand,
        commonAsset,
        type: 'offer_angles',
        payload: offerAngles(brand, campaignGoal),
        campaignGoal,
        sourceMedia,
        mediaNote,
        targets
      });
      return res.redirect(result.redirect);
    }

    if (action === 'hashtag_pack') {
      const hashtags = makeHashtags(brand, campaignGoal);
      const result = await saveGrowthAsset({
        req,
        brand,
        commonAsset,
        type: 'hashtag_pack',
        payload: {
          title: `${brand.name} hashtag pack`,
          summary: `A reusable hashtag set for ${campaignGoal || brand.businessType || brand.name}.`,
          sections: [{ heading: 'Hashtags', items: hashtags }]
        },
        campaignGoal,
        sourceMedia,
        mediaNote,
        targets
      });
      return res.redirect(result.redirect);
    }

    const growthActions = {
      content_ideas: () => contentIdeas(brand, campaignGoal),
      hook_generator: () => hookGenerator(brand, campaignGoal),
      reel_script: () => reelScriptGenerator(brand, campaignGoal),
      carousel_ideas: () => carouselIdeaGenerator(brand, campaignGoal),
      weekly_content_plan: () => contentPlanAsset(brand, campaignGoal, req.body.platforms, 7),
      monthly_content_plan: () => contentPlanAsset(brand, campaignGoal, req.body.platforms, 30),
      ad_copy_pack: () => adCopyPack(brand, campaignGoal)
    };

    if (growthActions[action]) {
      const result = await saveGrowthAsset({
        req,
        brand,
        commonAsset,
        type: action,
        payload: growthActions[action](),
        campaignGoal,
        sourceMedia,
        mediaNote,
        targets
      });
      return res.redirect(result.redirect);
    }

    return res.redirect('/dashboard/campaigns');
  } catch (error) {
    if (error.code === 'PUBLISHING_TARGETS_UNAVAILABLE') return res.redirect(`/dashboard/campaigns?error=${encodeURIComponent(error.message)}`);
    next(error);
  }
}

module.exports = { index, run };

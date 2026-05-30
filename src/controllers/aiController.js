const Brand = require('../models/Brand');
const Media = require('../models/Media');
const Post = require('../models/Post');
const Campaign = require('../models/Campaign');
const UsageLog = require('../models/UsageLog');
const ApiLog = require('../models/ApiLog');
const { generatePostIdea } = require('../services/aiContentService');
const { spendCredits } = require('../services/creditService');
const { assertCanGenerateText } = require('../services/usageLimitService');
const { buildCampaignPlan } = require('../services/campaignPlannerService');
const { makeHashtags } = require('../services/growthStudioService');
const { planAutomaticVideoScenes } = require('../services/videoPlannerService');

async function generatorPayload(user, extra = {}) {
  const brands = await Brand.find({ owner: user._id, status: 'active' }).sort({ name: 1 });
  const drafts = await Post.find({ createdBy: user._id, status: 'draft' })
    .populate('brand')
    .sort({ createdAt: -1 })
    .limit(10);
  const media = await Media.find({ uploadedBy: user._id, fileType: { $in: ['image', 'video'] } })
    .populate('brand')
    .sort({ createdAt: -1 })
    .limit(40);

  return {
    title: 'AI Generator',
    layout: 'layouts/dashboard',
    brands,
    drafts,
    media,
    result: null,
    toolResult: null,
    error: null,
    ...extra
  };
}

async function generator(req, res, next) {
  try {
    res.render('ai/generator', await generatorPayload(req.user));
  } catch (error) {
    next(error);
  }
}

async function generatePost(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });

    if (!brand) {
      return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });
    }

    await assertCanGenerateText(req.user);
    const sourceMedia = req.body.sourceMedia
      ? await Media.findOne({ _id: req.body.sourceMedia, uploadedBy: req.user._id, brand: brand._id })
      : null;

    const result = await generatePostIdea({
      brand,
      platform: req.body.platform,
      goal: req.body.goal,
      contentType: req.body.contentType,
      sourceMedia
    });

    await ApiLog.create({
      user: req.user._id,
      provider: result.provider?.startsWith('openai') ? 'openai' : 'local',
      action: 'generate_post',
      status: result.provider === 'openai' ? 'success' : 'skipped',
      message: `Generated post using ${result.provider}.`,
      metadata: { platform: req.body.platform, contentType: req.body.contentType }
    });

    const draft = await Post.create({
      brand: brand._id,
      platform: req.body.platform || 'facebook',
      type: sourceMedia?.fileType === 'video' ? 'video' : sourceMedia?.fileType === 'image' ? 'image' : 'text',
      title: result.title,
      description: result.description,
      caption: result.caption,
      hashtags: result.hashtags || [],
      media: sourceMedia ? [sourceMedia._id] : [],
      platformMetadata: {
        sourceMedia: sourceMedia?._id,
        callToAction: result.callToAction,
        imageIdea: result.imageIdea,
        imagePrompt: result.imagePrompt,
        videoScript: result.videoScript,
        platformVersion: result.platformVersion,
        bestPostingTime: result.bestPostingTime,
        contentScore: result.contentScore,
        improvementSuggestion: result.improvementSuggestion,
        safetyNotes: result.safetyNotes,
        youtubeTags: result.youtubeTags
      },
      status: 'draft',
      createdBy: req.user._id
    });

    await spendCredits({
      user: req.user,
      amount: 1,
      reason: 'AI post generation',
      referenceType: 'Post',
      referenceId: draft._id
    });

    await UsageLog.create({
      user: req.user._id,
      brand: brand._id,
      action: 'ai_generate_post',
      provider: result.provider,
      credits: 1,
      metadata: { platform: req.body.platform, contentType: req.body.contentType, sourceMedia: sourceMedia?._id }
    });

    return res.render('ai/generator', await generatorPayload(req.user, { result: { ...result, draftId: draft._id } }));
  } catch (error) {
    if (error.status === 402) {
      return res.status(402).render('ai/generator', await generatorPayload(req.user, { error: error.message }));
    }
    return next(error);
  }
}

async function generateHashtags(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    await spendCredits({ user: req.user, amount: 1, reason: 'AI hashtag generation', referenceType: 'Brand', referenceId: brand._id });
    const hashtags = makeHashtags(brand, req.body.goal);

    return res.render('ai/generator', await generatorPayload(req.user, {
      toolResult: {
        title: `${brand.name} hashtag pack`,
        body: hashtags.join(' '),
        notes: ['Use 3 to 8 hashtags per post for most platforms.', 'Mix brand, location, product, and campaign tags.']
      }
    }));
  } catch (error) {
    return next(error);
  }
}

async function generateVideoScript(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });
    const sourceMedia = req.body.sourceMedia
      ? await Media.findOne({ _id: req.body.sourceMedia, uploadedBy: req.user._id, brand: brand._id })
      : null;

    await spendCredits({ user: req.user, amount: 2, reason: 'AI video script generation', referenceType: 'Brand', referenceId: brand._id });
    const scenes = planAutomaticVideoScenes({
      brand,
      goal: req.body.goal,
      offer: req.body.offer,
      platform: req.body.platform,
      style: req.body.style
    }).map((scene) => sourceMedia ? {
      ...scene,
      visualPrompt: `${scene.visualPrompt} Use uploaded asset ${sourceMedia.fileName}: ${sourceMedia.aiPrompt || sourceMedia.aiInsights?.visualPrompt || sourceMedia.fileUrl}.`
    } : scene);

    return res.render('ai/generator', await generatorPayload(req.user, {
      toolResult: {
        title: `${brand.name} video script`,
        body: scenes.map((scene) => `${scene.order}. ${scene.title}: ${scene.narration}`).join('\n'),
        notes: scenes.map((scene) => scene.visualPrompt)
      }
    }));
  } catch (error) {
    return next(error);
  }
}

async function generateCampaign(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    await spendCredits({ user: req.user, amount: 10, reason: 'AI campaign generation', referenceType: 'Brand', referenceId: brand._id });
    const platforms = String(req.body.platforms || 'facebook, instagram')
      .split(',')
      .map((platform) => platform.trim().toLowerCase())
      .filter(Boolean);
    const aiPlan = buildCampaignPlan({ brand, goal: req.body.goal, platforms, durationDays: req.body.durationDays });
    const campaign = await Campaign.create({
      brand: brand._id,
      createdBy: req.user._id,
      name: req.body.name || `${brand.name} AI campaign`,
      goal: req.body.goal,
      description: req.body.description || 'Generated from the AI Generator.',
      platforms,
      postingFrequency: req.body.postingFrequency || brand.postingFrequency || '1 post per day',
      status: 'draft',
      aiPlan
    });

    return res.render('ai/generator', await generatorPayload(req.user, {
      toolResult: {
        title: `Campaign created: ${campaign.name}`,
        body: aiPlan.postIdeas.map((idea) => `Day ${idea.day} - ${idea.platform}: ${idea.caption}`).join('\n'),
        notes: aiPlan.contentPillars.concat(aiPlan.suggestedTimes)
      }
    }));
  } catch (error) {
    return next(error);
  }
}

module.exports = { generator, generateCampaign, generateHashtags, generatePost, generateVideoScript };

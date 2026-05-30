const Brand = require('../models/Brand');
const Campaign = require('../models/Campaign');
const Media = require('../models/Media');
const Post = require('../models/Post');
const AiVideoJob = require('../models/AiVideoJob');
const GrowthAsset = require('../models/GrowthAsset');
const {
  brandAudit,
  campaignBrief,
  competitorSnapshot,
  draftBatch,
  makeHashtags,
  offerAngles,
  videoStoryboard
} = require('../services/growthStudioService');
const { applyMediaToScenes, mediaContext } = require('../services/mediaInsightService');

async function index(req, res, next) {
  try {
    const [brands, media, assets, campaigns, videos] = await Promise.all([
      Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 }),
      Media.find({ uploadedBy: req.user._id, fileType: { $in: ['image', 'video'] } }).populate('brand').sort({ createdAt: -1 }).limit(40),
      GrowthAsset.find({ owner: req.user._id }).populate('brand').sort({ createdAt: -1 }).limit(20),
      Campaign.find({ createdBy: req.user._id }).populate('brand').sort({ createdAt: -1 }).limit(5),
      AiVideoJob.find({ createdBy: req.user._id }).populate('brand').sort({ createdAt: -1 }).limit(5)
    ]);

    res.render('growth-studio/index', {
      title: 'Growth Studio',
      layout: 'layouts/dashboard',
      brands,
      media,
      assets,
      campaigns,
      videos,
      message: req.query.created || null,
      error: null
    });
  } catch (error) {
    next(error);
  }
}

async function run(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    const campaignGoal = req.body.campaignGoal;
    const action = req.body.actionType;
    const commonAsset = { owner: req.user._id, brand: brand._id };
    const sourceMedia = req.body.sourceMedia ? await Media.findOne({ _id: req.body.sourceMedia, uploadedBy: req.user._id, brand: brand._id }) : null;
    const mediaNote = sourceMedia ? `\n\nUse uploaded media: ${mediaContext(sourceMedia)}` : '';

    if (action === 'campaign_brief') {
      await Campaign.create({
        ...campaignBrief({ brand, campaignGoal, platforms: req.body.platforms }),
        brand: brand._id,
        createdBy: req.user._id
      });
      return res.redirect('/dashboard/campaigns?created=campaign');
    }

    if (action === 'draft_batch') {
      const drafts = draftBatch({ brand, campaignGoal, platforms: req.body.platforms }).map((draft) => ({
        ...draft,
        caption: `${draft.caption}${mediaNote}`,
        media: sourceMedia ? [sourceMedia._id] : [],
        platformMetadata: sourceMedia ? { sourceMedia: sourceMedia._id, mediaPrompt: sourceMedia.aiPrompt, mediaInsights: sourceMedia.aiInsights } : {},
        createdBy: req.user._id
      }));
      await Post.insertMany(drafts);
      return res.redirect('/dashboard/campaigns?created=drafts');
    }

    if (action === 'video_storyboard') {
      const storyboard = videoStoryboard({ brand, campaignGoal, platform: req.body.platforms, style: req.body.style });
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
      await GrowthAsset.create({ ...commonAsset, type: 'brand_audit', ...brandAudit(brand) });
      return res.redirect('/dashboard/campaigns?created=audit');
    }

    if (action === 'competitor_snapshot') {
      await GrowthAsset.create({ ...commonAsset, type: 'competitor_snapshot', ...competitorSnapshot(brand, campaignGoal) });
      return res.redirect('/dashboard/campaigns?created=competitors');
    }

    if (action === 'offer_angles') {
      await GrowthAsset.create({ ...commonAsset, type: 'offer_angles', ...offerAngles(brand, campaignGoal) });
      return res.redirect('/dashboard/campaigns?created=angles');
    }

    if (action === 'hashtag_pack') {
      const hashtags = makeHashtags(brand, campaignGoal);
      await GrowthAsset.create({
        ...commonAsset,
        type: 'hashtag_pack',
        title: `${brand.name} hashtag pack`,
        summary: `A reusable hashtag set for ${campaignGoal || brand.businessType || brand.name}.`,
        sections: [{ heading: 'Hashtags', items: hashtags }]
      });
      return res.redirect('/dashboard/campaigns?created=hashtags');
    }

    return res.redirect('/dashboard/campaigns');
  } catch (error) {
    next(error);
  }
}

module.exports = { index, run };

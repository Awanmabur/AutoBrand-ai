const Brand = require('../models/Brand');
const Campaign = require('../models/Campaign');
const Post = require('../models/Post');
const { buildCampaignPlan } = require('../services/campaignPlannerService');

function splitPlatforms(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

async function index(req, res, next) {
  try {
    const [brands, campaigns] = await Promise.all([
      Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 }),
      Campaign.find({ createdBy: req.user._id }).populate('brand').sort({ createdAt: -1 })
    ]);

    res.render('campaigns/index', { title: 'Campaigns', layout: 'layouts/dashboard', brands, campaigns, error: null });
  } catch (error) {
    next(error);
  }
}

async function store(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    const platforms = splitPlatforms(req.body.platforms);
    const aiPlan = buildCampaignPlan({
      brand,
      goal: req.body.goal,
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
    if (!campaign) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    const drafts = campaign.aiPlan.postIdeas.map((idea) => ({
      brand: campaign.brand._id,
      campaign: campaign._id,
      platform: idea.platform,
      type: idea.platform === 'youtube' || idea.platform === 'tiktok' ? 'video' : 'text',
      title: idea.title,
      caption: idea.caption,
      hashtags: campaign.brand.preferredHashtags || [],
      status: 'draft',
      createdBy: req.user._id
    }));

    if (drafts.length) await Post.insertMany(drafts);
    res.redirect('/dashboard/content-library');
  } catch (error) {
    next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!campaign) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    campaign.status = req.body.status;
    await campaign.save();
    res.redirect('/dashboard/campaigns');
  } catch (error) {
    next(error);
  }
}

module.exports = { createDrafts, index, store, updateStatus };

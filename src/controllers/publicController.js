const Brand = require('../models/Brand');
const Post = require('../models/Post');
const Campaign = require('../models/Campaign');
const SocialAccount = require('../models/SocialAccount');
const Media = require('../models/Media');
const AiVideoJob = require('../models/AiVideoJob');
const User = require('../models/User');
const { getPublicPricingCards } = require('../services/pricing.service');

function compactNumber(value) {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}m`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
  return String(number);
}

async function getLandingStats() {
  const [
    activeBrands,
    totalPosts,
    publishedPosts,
    scheduledPosts,
    campaigns,
    connectedAccounts,
    mediaAssets,
    videoJobs,
    users
  ] = await Promise.all([
    Brand.countDocuments({ status: 'active' }),
    Post.countDocuments({}),
    Post.countDocuments({ status: 'published' }),
    Post.countDocuments({ status: 'scheduled' }),
    Campaign.countDocuments({ status: { $ne: 'archived' } }),
    SocialAccount.countDocuments({ status: 'connected' }),
    Media.countDocuments({}),
    AiVideoJob.countDocuments({}),
    User.countDocuments({ status: { $ne: 'suspended' } })
  ]);

  const generatedAssets = totalPosts + mediaAssets + videoJobs;
  const approvalRate = totalPosts ? Math.round((publishedPosts / totalPosts) * 100) : 76;
  const platformCount = Math.max(connectedAccounts, 5);

  return {
    activeBrands,
    totalPosts,
    publishedPosts,
    scheduledPosts,
    campaigns,
    connectedAccounts,
    mediaAssets,
    videoJobs,
    users,
    generatedAssets,
    approvalRate,
    platformCount,
    activeBrandsLabel: compactNumber(activeBrands),
    totalPostsLabel: compactNumber(totalPosts),
    generatedAssetsLabel: compactNumber(generatedAssets),
    campaignsLabel: compactNumber(campaigns),
    connectedAccountsLabel: compactNumber(connectedAccounts),
    usersLabel: compactNumber(users)
  };
}

function planComparisonRows(pricingPlans = []) {
  const keys = [
    ['maxBrands', 'Brands'],
    ['maxSocialAccounts', 'Social accounts'],
    ['maxTeamMembers', 'Team members'],
    ['maxScheduledPosts', 'Scheduled posts'],
    ['maxAutoPosts', 'Auto posts'],
    ['maxHandoffPosts', 'Handoff posts'],
    ['maxAiTextGenerations', 'AI text generations'],
    ['maxAiImageGenerations', 'AI images'],
    ['maxAiVideoGenerations', 'AI videos'],
    ['maxAvatarVideos', 'Avatar videos'],
    ['maxClientApprovalLinks', 'Approval links']
  ];
  return keys.map(([key, label]) => ({
    key,
    label,
    values: pricingPlans.map((plan) => {
      const value = plan.limits?.[key];
      if (value === -1 || value === 'unlimited') return 'Unlimited';
      if (value === undefined || value === null || value === '') return '—';
      return String(value);
    })
  }));
}

async function renderLanding(req, res, next, options = {}) {
  try {
    const [siteStats, pricingPlans] = await Promise.all([
      getLandingStats(),
      getPublicPricingCards()
    ]);
    const selectedPlan = options.selectedPlanSlug
      ? pricingPlans.find((plan) => plan.slug === options.selectedPlanSlug) || null
      : null;

    res.render('public/landing', {
      title: options.title || 'AutoBrand AI',
      layout: false,
      pricingPlans,
      selectedPlan,
      planComparisonRows: planComparisonRows(pricingPlans),
      initialPublicPage: options.initialPublicPage || 'homePage',
      siteStats
    });
  } catch (error) {
    next(error);
  }
}

function landing(req, res, next) {
  return renderLanding(req, res, next, { initialPublicPage: 'homePage', title: 'AutoBrand AI' });
}

function pricing(req, res, next) {
  return renderLanding(req, res, next, { initialPublicPage: 'pricingPage', title: 'Pricing' });
}

function planDetails(req, res, next) {
  return renderLanding(req, res, next, {
    initialPublicPage: 'planDetailPage',
    selectedPlanSlug: req.params.planSlug,
    title: 'Plan details'
  });
}

function signup(req, res) {
  const query = req.query.plan ? `?plan=${encodeURIComponent(req.query.plan)}` : '';
  res.redirect(`/auth/register${query}`);
}

module.exports = { landing, pricing, planDetails, signup };

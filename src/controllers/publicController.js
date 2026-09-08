const Brand = require('../models/Brand');
const Post = require('../models/Post');
const Campaign = require('../models/Campaign');
const SocialAccount = require('../models/SocialAccount');
const Media = require('../models/Media');
const AiVideoJob = require('../models/AiVideoJob');
const User = require('../models/User');
const { getPublicPricingCards } = require('../services/pricing.service');
const { signupNextUrlForPlan } = require('../services/signupPlan.service');

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
  const limitValue = (plan, key) => {
    const row = (plan.limitList || []).find((item) => item.key === key);
    return row?.detail || row?.value || '—';
  };
  const rows = [
    ['price', 'Price', (plan) => plan.recurringPriceLabel || plan.priceLabel],
    ['workflow', 'Workflow', (plan) => plan.workflowLabel || plan.familyLabel],
    ['aiMode', 'Generative AI', (plan) => plan.aiModeLabel],
    ['aiCredits', 'AI credits', (plan) => plan.aiCreditsLabel],
    ['maxBrands', 'Active brands', (plan) => limitValue(plan, 'maxBrands')],
    ['maxSocialAccounts', 'Connected social accounts', (plan) => limitValue(plan, 'maxSocialAccounts')],
    ['maxTeamMembers', 'Team members', (plan) => limitValue(plan, 'maxTeamMembers')],
    ['maxManualPosts', 'Manual/imported posts', (plan) => limitValue(plan, 'maxManualPosts')],
    ['maxScheduledPosts', 'Scheduled posts', (plan) => limitValue(plan, 'maxScheduledPosts')],
    ['maxAutoPosts', 'Auto posts', (plan) => limitValue(plan, 'maxAutoPosts')],
    ['maxHandoffPosts', 'Handoff posts', (plan) => limitValue(plan, 'maxHandoffPosts')],
    ['maxAiTextGenerations', 'AI text generations', (plan) => limitValue(plan, 'maxAiTextGenerations')],
    ['maxAiImageGenerations', 'AI images', (plan) => limitValue(plan, 'maxAiImageGenerations')],
    ['maxAiVideoGenerations', 'AI videos', (plan) => limitValue(plan, 'maxAiVideoGenerations')],
    ['maxAvatarVideos', 'Avatar videos', (plan) => limitValue(plan, 'maxAvatarVideos')],
    ['maxClientApprovalLinks', 'Client approval links', (plan) => limitValue(plan, 'maxClientApprovalLinks')],
    ['maxStorageMb', 'Media storage', (plan) => limitValue(plan, 'maxStorageMb')],
    ['usageReset', 'Usage reset', (plan) => plan.usageResetLabel]
  ];
  return rows.map(([key, label, getter]) => ({
    key,
    label,
    values: pricingPlans.map((plan) => getter(plan) || '—')
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

async function startPlan(req, res, next) {
  try {
    const pricingPlans = await getPublicPricingCards();
    const plan = pricingPlans.find((item) => item.slug === req.params.planSlug);
    if (!plan) {
      const error = new Error('Plan not found.');
      error.status = 404;
      throw error;
    }
    const checkoutPath = `/dashboard/billing/checkout/${encodeURIComponent(plan.slug)}`;
    if (req.user) return res.redirect(`${checkoutPath}?onboarding=1`);
    const nextPath = signupNextUrlForPlan(plan);
    return res.redirect(`/auth/register?plan=${encodeURIComponent(plan.slug)}&next=${encodeURIComponent(nextPath)}`);
  } catch (error) {
    next(error);
  }
}

async function signup(req, res, next) {
  try {
    const planSlug = req.query.plan ? String(req.query.plan) : 'free-trial';
    const pricingPlans = await getPublicPricingCards();
    const plan = pricingPlans.find((item) => item.slug === planSlug) || pricingPlans.find((item) => item.slug === 'free-trial');
    if (!plan) return res.redirect('/pricing');
    const nextPath = signupNextUrlForPlan(plan);
    return res.redirect(`/auth/register?plan=${encodeURIComponent(plan.slug)}&next=${encodeURIComponent(nextPath)}`);
  } catch (error) {
    return next(error);
  }
}

module.exports = { landing, pricing, planDetails, signup, startPlan };

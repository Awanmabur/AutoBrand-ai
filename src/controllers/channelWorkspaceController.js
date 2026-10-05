const Brand = require('../models/Brand');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const Analytics = require('../models/Analytics');
const { accessibleBrandIds } = require('../services/authorization/brandAccess.service');
const { PLATFORM_CATALOG, platformLabel, destinationReadiness } = require('../services/social/socialDestination.service');
const { buildAnalyticsDashboard } = require('../services/analytics/analyticsDashboard.service');
const { getDashboardEntitlementPlan, LEVEL_ORDER } = require('../services/subscription/workspaceEntitlement.service');

const CATALOG = new Map(PLATFORM_CATALOG.map((item) => [item.key, item]));

function validPlatform(value) {
  const key = String(value || '').trim().toLowerCase();
  return CATALOG.has(key) ? key : '';
}

function syncActionFor(platform, id) {
  const suffix = {
    tiktok: 'tiktok-sync', youtube: 'youtube-sync', linkedin: 'linkedin-sync',
    google_business: 'google-business-sync', pinterest: 'pinterest-sync', x: 'x-sync', threads: 'threads-sync'
  }[platform];
  return suffix ? `/dashboard/actions/social/${id}/${suffix}` : '';
}

function postTitle(post) {
  return post.title || post.caption || `${platformLabel(post.platform)} post`;
}

async function show(req, res, next) {
  try {
    const platform = validPlatform(req.params.platform);
    if (!platform) return res.status(404).render('dashboard/pages/error', { layout: 'layouts/dashboard', title: 'Channel not found', message: 'That social channel is not supported.' });

    const [viewBrandIds, contentBrandIds] = await Promise.all([
      accessibleBrandIds(req.user, 'brand.view'),
      accessibleBrandIds(req.user, 'content.view')
    ]);
    const requestedBrand = String(req.query.brand || '').trim();
    const allowedBrandIds = requestedBrand && viewBrandIds.some((id) => String(id) === requestedBrand)
      ? viewBrandIds.filter((id) => String(id) === requestedBrand)
      : viewBrandIds;
    const contentIds = contentBrandIds.filter((id) => allowedBrandIds.some((allowed) => String(allowed) === String(id)));
    const entitlementPlan = await getDashboardEntitlementPlan(req.user, allowedBrandIds);
    if (req.user.role !== 'super_admin' && !entitlementPlan?.features?.channelWorkspacesAccess) {
      const error = new Error('Per-channel social workspaces are not included in this plan.');
      error.status = 402;
      throw error;
    }
    const analyticsLevel = String(entitlementPlan?.features?.analyticsLevel || 'none').toLowerCase();
    const analyticsRank = LEVEL_ORDER[analyticsLevel] || 0;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [brands, accounts, posts, analytics] = await Promise.all([
      Brand.find({ _id: { $in: allowedBrandIds }, status: 'active' }).sort({ name: 1 }).lean(),
      SocialAccount.find({ brand: { $in: allowedBrandIds }, platform }).populate('brand', 'name').sort({ updatedAt: -1 }).lean(),
      Post.find({
        brand: { $in: contentIds },
        $or: [
          { platform }, { platforms: platform }, { 'publishResults.platform': platform }
        ]
      }).populate('brand', 'name').populate('media').sort({ updatedAt: -1 }).limit(80).lean(),
      Analytics.find({ brand: { $in: allowedBrandIds }, platform, metricDate: { $gte: since } })
        .populate('brand', 'name').populate('post', 'title caption platformPostUrl').populate('account', 'accountName')
        .sort({ metricDate: -1 }).limit(600).lean()
    ]);

    const analyticsView = buildAnalyticsDashboard({ analyticsRecords: analytics, posts, campaigns: [], socialAccounts: accounts, analyticsSyncJobs: [] });
    const published = posts.filter((post) => post.status === 'published').length;
    const failed = posts.filter((post) => post.status === 'failed').length;
    const scheduled = posts.filter((post) => post.status === 'scheduled').length;
    const successRate = published + failed ? Math.round((published / (published + failed)) * 100) : 0;

    const accountCards = accounts.map((account) => {
      const readiness = destinationReadiness(account, { verifyEncryption: true });
      return {
        id: String(account._id),
        name: account.accountName,
        brand: account.brand?.name || 'Brand',
        status: account.status,
        health: readiness.health?.status || account.healthStatus || 'unknown',
        ready: readiness.ready,
        blockers: readiness.blockers || [],
        lastSyncAt: account.lastSyncAt,
        lastPublishError: account.lastPublishError || '',
        syncAction: syncActionFor(platform, account._id)
      };
    });

    const recentPosts = posts.slice(0, 20).map((post) => ({
      id: String(post._id),
      title: postTitle(post),
      brand: post.brand?.name || 'Brand',
      type: post.type,
      status: post.status,
      scheduledAt: post.scheduledAt,
      publishedAt: post.publishedAt,
      url: post.platformPostUrl || post.publishResults?.find((item) => item.platform === platform)?.platformPostUrl || '',
      error: post.errorMessage || post.publishResults?.find((item) => item.platform === platform && item.errorMessage)?.errorMessage || ''
    }));

    return res.render('dashboard/channel-workspace', {
      layout: 'layouts/dashboard',
      title: `${platformLabel(platform)} Workspace`,
      platform,
      platformLabel: platformLabel(platform),
      brands,
      selectedBrand: requestedBrand,
      accounts: accountCards,
      recentPosts,
      analyticsView,
      analyticsLevel,
      analyticsCapabilities: {
        basic: analyticsRank >= LEVEL_ORDER.basic,
        recommendations: analyticsRank >= LEVEL_ORDER.standard,
        topPerformance: analyticsRank >= LEVEL_ORDER.standard,
        advanced: analyticsRank >= LEVEL_ORDER.advanced
      },
      stats: {
        accounts: accounts.length,
        readyAccounts: accountCards.filter((item) => item.ready).length,
        published,
        scheduled,
        failed,
        successRate,
        impressions: analyticsView.totals?.impressions || 0,
        reach: analyticsView.totals?.reach || 0,
        engagementRate: analyticsView.totals?.engagementRate || 0,
        followersGained: analyticsView.totals?.followersGained || 0
      }
    });
  } catch (error) { return next(error); }
}

module.exports = { show };

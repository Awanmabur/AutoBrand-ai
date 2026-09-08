const Analytics = require('../models/Analytics');
const Campaign = require('../models/Campaign');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const {
  analyticsRecordsWithFallback,
  csvForAnalyticsRecords
} = require('../services/analytics/analyticsDashboard.service');
const { accessibleBrandIds } = require('../services/authorization/brandAccess.service');

async function exportCsv(req, res, next) {
  try {
    const brandIds = await accessibleBrandIds(req.user, 'analytics.view', { status: 'active' });
    const brandFilter = brandIds.length ? { $in: brandIds } : { $in: [] };
    const [analyticsRecords, posts, campaigns, socialAccounts] = await Promise.all([
      Analytics.find({ brand: brandFilter })
        .populate('brand')
        .populate('campaign')
        .populate('post')
        .populate('account')
        .sort({ metricDate: -1, updatedAt: -1 })
        .limit(1000)
        .lean(),
      Post.find({ brand: brandFilter })
        .populate('brand')
        .populate('campaign')
        .sort({ updatedAt: -1 })
        .limit(200)
        .lean(),
      Campaign.find({ brand: brandFilter }).sort({ updatedAt: -1 }).limit(100).lean(),
      SocialAccount.find({ brand: brandFilter }).sort({ updatedAt: -1 }).limit(100).lean()
    ]);

    const records = analyticsRecordsWithFallback({ analyticsRecords });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=\"autobrand-analytics.csv\"');
    res.send(csvForAnalyticsRecords(records));
  } catch (error) {
    next(error);
  }
}

module.exports = { exportCsv };

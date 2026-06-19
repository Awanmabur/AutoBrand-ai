const Analytics = require('../models/Analytics');
const Brand = require('../models/Brand');
const Campaign = require('../models/Campaign');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const {
  analyticsRecordsWithFallback,
  csvForAnalyticsRecords
} = require('../services/analytics/analyticsDashboard.service');

async function exportCsv(req, res, next) {
  try {
    const brands = await Brand.find({ owner: req.user._id, status: 'active' }).select('_id name').lean();
    const brandIds = brands.map((brand) => brand._id);
    const [analyticsRecords, posts, campaigns, socialAccounts] = await Promise.all([
      brandIds.length
        ? Analytics.find({ brand: { $in: brandIds } })
            .populate('brand')
            .populate('campaign')
            .populate('post')
            .populate('account')
            .sort({ metricDate: -1, updatedAt: -1 })
            .limit(1000)
            .lean()
        : Promise.resolve([]),
      Post.find({ createdBy: req.user._id })
        .populate('brand')
        .populate('campaign')
        .sort({ updatedAt: -1 })
        .limit(200)
        .lean(),
      Campaign.find({ createdBy: req.user._id }).sort({ updatedAt: -1 }).limit(100).lean(),
      SocialAccount.find({ owner: req.user._id }).sort({ updatedAt: -1 }).limit(100).lean()
    ]);

    const records = analyticsRecordsWithFallback({ analyticsRecords, posts, campaigns, socialAccounts });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=\"autobrand-analytics.csv\"');
    res.send(csvForAnalyticsRecords(records));
  } catch (error) {
    next(error);
  }
}

module.exports = { exportCsv };

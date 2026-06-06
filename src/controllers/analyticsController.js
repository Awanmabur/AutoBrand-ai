const Analytics = require('../models/Analytics');
const Brand = require('../models/Brand');
const Post = require('../models/Post');
const { updateBrandPerformanceMemoryForOwner } = require('../services/analyticsMemoryService');

async function index(req, res, next) {
  try {
    await updateBrandPerformanceMemoryForOwner(req.user._id);
    const brands = await Brand.find({ owner: req.user._id }).sort({ name: 1 });
    const brandIds = brands.map((brand) => brand._id);
    const [analytics, publishedCount, scheduledCount, posts] = await Promise.all([
      Analytics.find({ brand: { $in: brandIds } }).populate('brand').populate('post').sort({ updatedAt: -1 }).limit(80),
      Post.countDocuments({ createdBy: req.user._id, status: 'published' }),
      Post.countDocuments({ createdBy: req.user._id, status: 'scheduled' }),
      Post.find({ createdBy: req.user._id }).sort({ updatedAt: -1 }).limit(80)
    ]);

    const totals = analytics.reduce(
      (acc, item) => {
        acc.views += item.views;
        acc.likes += item.likes;
        acc.comments += item.comments;
        acc.shares += item.shares;
        acc.clicks += item.clicks;
        return acc;
      },
      { views: 0, likes: 0, comments: 0, shares: 0, clicks: 0, publishedCount, scheduledCount }
    );

    const platformTotals = analytics.reduce((acc, item) => {
      acc[item.platform] = (acc[item.platform] || 0) + item.likes + item.comments + item.shares + item.clicks;
      return acc;
    }, {});
    const bestPlatform = Object.entries(platformTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || posts[0]?.platform || 'not enough data';
    const failedPosts = posts.filter((post) => post.status === 'failed').length;
    const videoPosts = posts.filter((post) => ['video', 'avatar_video'].includes(post.type)).length;
    const recommendations = [
      bestPlatform === 'not enough data' ? 'Publish and sync analytics to identify the strongest platform.' : `Prioritize ${bestPlatform} because it currently has the strongest engagement signal.`,
      scheduledCount ? 'Keep reviewing scheduled posts before publish time so approvals and CTAs stay fresh.' : 'Schedule at least three posts so the calendar starts building consistency.',
      videoPosts ? 'Reuse video posts that perform well as templates for future campaigns.' : 'Create one short video storyboard for the best current offer.',
      failedPosts ? 'Retry failed posts from Admin or reconnect the affected social account.' : 'No failed posts in the current internal data set.'
    ];

    res.render('analytics/index', { title: 'Analytics', layout: 'layouts/dashboard', analytics, totals, insights: { bestPlatform, failedPosts, videoPosts, recommendations } });
  } catch (error) {
    next(error);
  }
}

module.exports = { index };

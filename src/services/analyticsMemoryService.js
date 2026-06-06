const Analytics = require('../models/Analytics');
const Brand = require('../models/Brand');

function engagementScore(item) {
  return Number(item.likes || 0) * 3
    + Number(item.comments || 0) * 4
    + Number(item.shares || 0) * 5
    + Number(item.clicks || 0) * 3
    + Number(item.views || 0) * 0.1
    + Number(item.reach || 0) * 0.05
    + Number(item.engagementRate || 0) * 10;
}

function topicFromPost(post) {
  const source = [post?.title, post?.caption, post?.description].filter(Boolean).join(' ');
  const words = source
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9#\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 4 && !['about', 'today', 'brand', 'contact', 'offer', 'local'].includes(word));
  return words.slice(0, 3).join(' ') || post?.platform || '';
}

function bestPostMemory(item) {
  const post = item.post || {};
  return {
    title: post.title || `${item.platform} post`,
    caption: post.caption || '',
    platform: item.platform || post.platform || '',
    metrics: {
      views: item.views || 0,
      likes: item.likes || 0,
      comments: item.comments || 0,
      shares: item.shares || 0,
      clicks: item.clicks || 0,
      reach: item.reach || 0,
      engagementRate: item.engagementRate || 0,
      score: engagementScore(item),
      syncedAt: item.lastSyncedAt || item.updatedAt || new Date()
    }
  };
}

async function updateBrandPerformanceMemoryForOwner(ownerId) {
  const brands = await Brand.find({ owner: ownerId }).select('_id');
  const brandIds = brands.map((brand) => brand._id);
  if (!brandIds.length) return { updated: 0 };

  const analytics = await Analytics.find({ brand: { $in: brandIds }, post: { $ne: null } })
    .populate('post')
    .sort({ updatedAt: -1 })
    .limit(300);

  const grouped = analytics.reduce((map, item) => {
    if (!item.post) return map;
    const key = String(item.brand);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());

  let updated = 0;
  for (const [brandId, records] of grouped.entries()) {
    const ranked = records
      .sort((a, b) => engagementScore(b) - engagementScore(a))
      .slice(0, 10);
    if (!ranked.length) continue;

    const previousBestPosts = ranked.map(bestPostMemory);
    const highPerformingTopics = [...new Set(ranked.map((item) => topicFromPost(item.post)).filter(Boolean))].slice(0, 12);
    await Brand.updateOne(
      { _id: brandId, owner: ownerId },
      {
        $set: {
          previousBestPosts,
          highPerformingTopics
        }
      }
    );

    const brand = await Brand.findOne({ _id: brandId, owner: ownerId });
    const memoryContent = previousBestPosts.slice(0, 5).map((post) => `${post.platform}: ${post.title} (${Math.round(post.metrics.score)} score)`).join('\n');
    const memoryEntry = brand?.brandKnowledgeBase.find((entry) => entry.source === 'analytics_memory');
    if (memoryEntry) {
      memoryEntry.content = memoryContent;
      memoryEntry.title = 'Analytics performance memory';
      await brand.save();
    } else if (brand) {
      brand.brandKnowledgeBase.push({
        title: 'Analytics performance memory',
        content: memoryContent,
        source: 'analytics_memory'
      });
      await brand.save();
    }
    updated += 1;
  }

  return { updated };
}

module.exports = { engagementScore, updateBrandPerformanceMemoryForOwner };

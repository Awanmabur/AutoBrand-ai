const Analytics = require('../models/Analytics');
const Brand = require('../models/Brand');

function engagementScore(item) {
  return Number(item.likes || 0) * 3
    + Number(item.comments || 0) * 4
    + Number(item.shares || 0) * 5
    + Number(item.saves || 0) * 4
    + Number(item.clicks || 0) * 3
    + Number(item.followersGained || 0) * 8
    + Number(item.views || 0) * 0.1
    + Number(item.reach || 0) * 0.05
    + Number(item.impressions || 0) * 0.02
    + Number(item.watchTimeSeconds || 0) * 0.015
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
      impressions: item.impressions || 0,
      watchTimeSeconds: item.watchTimeSeconds || 0,
      likes: item.likes || 0,
      comments: item.comments || 0,
      shares: item.shares || 0,
      saves: item.saves || 0,
      clicks: item.clicks || 0,
      reach: item.reach || 0,
      followersGained: item.followersGained || 0,
      engagementRate: item.engagementRate || 0,
      score: engagementScore(item),
      syncedAt: item.lastSyncedAt || item.updatedAt || new Date()
    }
  };
}

function normalizeBrandIds(brandIds = []) {
  return [...new Set((Array.isArray(brandIds) ? brandIds : [brandIds]).map((value) => value?._id || value).filter(Boolean).map(String))];
}

async function updateBrandPerformanceMemory({ brandIds } = {}) {
  const ids = normalizeBrandIds(brandIds);
  if (!ids.length) return { updated: 0 };

  const brands = await Brand.find({ _id: { $in: ids } }).select('_id brandKnowledgeBase').lean();
  const existing = new Set(brands.map((brand) => String(brand._id)));
  const analytics = await Analytics.find({ brand: { $in: [...existing] }, post: { $ne: null }, source: 'provider' })
    .populate('post')
    .sort({ updatedAt: -1 })
    .limit(Math.min(1000, Math.max(300, existing.size * 100)));

  const grouped = analytics.reduce((map, item) => {
    if (!item.post) return map;
    const key = String(item.brand);
    if (!existing.has(key)) return map;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());

  let updated = 0;
  for (const [brandId, records] of grouped.entries()) {
    const ranked = records.sort((a, b) => engagementScore(b) - engagementScore(a)).slice(0, 10);
    if (!ranked.length) continue;
    const previousBestPosts = ranked.map(bestPostMemory);
    const highPerformingTopics = [...new Set(ranked.map((item) => topicFromPost(item.post)).filter(Boolean))].slice(0, 12);
    const memoryContent = previousBestPosts.slice(0, 5)
      .map((post) => `${post.platform}: ${post.title} (${Math.round(post.metrics.score)} score)`)
      .join('\n');

    // Refresh the shared brand itself; actor identity is irrelevant here because this is
    // provider-derived workspace memory, not an interactive user mutation.
    const brand = await Brand.findById(brandId);
    if (!brand) continue;
    brand.previousBestPosts = previousBestPosts;
    brand.highPerformingTopics = highPerformingTopics;
    const memoryEntry = (brand.brandKnowledgeBase || []).find((entry) => entry.source === 'analytics_memory');
    if (memoryEntry) {
      memoryEntry.title = 'Analytics performance memory';
      memoryEntry.content = memoryContent;
    } else {
      brand.brandKnowledgeBase.push({ title: 'Analytics performance memory', content: memoryContent, source: 'analytics_memory' });
    }
    await brand.save();
    updated += 1;
  }
  return { updated };
}

// Compatibility helper for maintenance scripts. Interactive/team flows should pass
// explicit brand IDs or rely on analytics synchronization rather than owner-scoped reads.
async function updateBrandPerformanceMemoryForOwner(ownerId) {
  const brandIds = await Brand.find({ owner: ownerId }).distinct('_id');
  return updateBrandPerformanceMemory({ brandIds });
}

module.exports = { engagementScore, updateBrandPerformanceMemory, updateBrandPerformanceMemoryForOwner };

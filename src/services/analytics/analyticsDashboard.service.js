const METRIC_KEYS = [
  'impressions',
  'reach',
  'views',
  'watchTimeSeconds',
  'likes',
  'comments',
  'shares',
  'saves',
  'clicks',
  'followersGained'
];

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordId(record) {
  return record?._id?.toString?.() || record?.id?.toString?.() || '';
}

function stableNumber(seed = '', min = 0, max = 100) {
  const source = String(seed || 'analytics');
  const hash = source.split('').reduce((total, char, index) => total + char.charCodeAt(0) * (index + 17), 0);
  return min + (hash % Math.max(1, max - min + 1));
}

function deriveEngagementRate(metrics = {}) {
  const base = Math.max(number(metrics.impressions), number(metrics.reach), number(metrics.views));
  if (!base) return Number(number(metrics.engagementRate).toFixed(2));
  const engagement = number(metrics.likes) + number(metrics.comments) + number(metrics.shares) + number(metrics.saves) + number(metrics.clicks);
  return Number(((engagement / base) * 100).toFixed(2));
}

function analyticsScore(record = {}) {
  return number(record.likes) * 3
    + number(record.comments) * 4
    + number(record.shares) * 5
    + number(record.saves) * 4
    + number(record.clicks) * 3
    + number(record.followersGained) * 8
    + number(record.views) * 0.1
    + number(record.reach) * 0.05
    + number(record.watchTimeSeconds) * 0.015
    + deriveEngagementRate(record) * 10;
}

function metricDateFor(record = {}) {
  return record.metricDate || record.lastSyncedAt || record.publishedAt || record.scheduledAt || record.createdAt || new Date();
}

function mockMetricsForPost(post = {}, index = 0) {
  const id = recordId(post) || `${post.platform || 'post'}-${index}`;
  const type = String(post.type || '').toLowerCase();
  const platform = post.platform || 'facebook';
  const isVideo = ['video', 'reel', 'avatar_video'].includes(type) || ['tiktok', 'youtube'].includes(platform);
  const base = stableNumber(`${id}-${platform}`, 420, 5400);
  const impressions = base;
  const reach = Math.round(base * (0.58 + stableNumber(id, 0, 20) / 100));
  const views = isVideo ? Math.round(base * 0.82) : Math.round(base * 0.38);
  const likes = Math.round(base / stableNumber(`${id}-likes`, 28, 58));
  const comments = Math.round(likes / stableNumber(`${id}-comments`, 5, 12));
  const shares = Math.round(likes / stableNumber(`${id}-shares`, 4, 10));
  const saves = Math.round(likes / stableNumber(`${id}-saves`, 3, 9));
  const clicks = Math.round(base / stableNumber(`${id}-clicks`, 34, 95));
  const watchTimeSeconds = isVideo ? Math.round(views * stableNumber(`${id}-watch`, 6, 18)) : 0;
  const followersGained = Math.round((likes + shares + saves) / stableNumber(`${id}-followers`, 18, 42));
  const metrics = {
    brand: post.brand,
    campaign: post.campaign,
    post,
    platform,
    impressions,
    reach,
    views,
    watchTimeSeconds,
    likes,
    comments,
    shares,
    saves,
    clicks,
    followersGained,
    metricDate: metricDateFor(post),
    lastSyncedAt: metricDateFor(post),
    source: 'mock',
    summary: 'Development analytics generated from post metadata.'
  };
  metrics.engagementRate = deriveEngagementRate(metrics);
  return metrics;
}

function normalizeAnalyticsRecord(record = {}) {
  const normalized = {
    id: recordId(record),
    brand: record.brand,
    campaign: record.campaign || record.post?.campaign,
    account: record.account,
    post: record.post,
    platform: record.platform || record.post?.platform || record.account?.platform || 'facebook',
    metricDate: metricDateFor(record),
    lastSyncedAt: record.lastSyncedAt || record.updatedAt || record.metricDate || new Date(),
    source: record.source || 'provider',
    summary: record.summary || ''
  };

  METRIC_KEYS.forEach((key) => {
    normalized[key] = number(record[key]);
  });
  normalized.engagementRate = record.engagementRate ? number(record.engagementRate) : deriveEngagementRate(normalized);
  normalized.score = analyticsScore(normalized);
  return normalized;
}

function analyticsRecordsWithFallback({ analyticsRecords = [], posts = [] } = {}) {
  const normalized = analyticsRecords.map(normalizeAnalyticsRecord);
  const analyticsPostIds = new Set(normalized.map((record) => recordId(record.post)).filter(Boolean));
  const seenPostIds = new Set();
  const fallbackPosts = posts
    .filter((post) => {
      if (!post) return false;
      const id = recordId(post);
      if (id && (analyticsPostIds.has(id) || seenPostIds.has(id))) return false;
      if (id) seenPostIds.add(id);
      return true;
    })
    .slice(0, 60)
    .map((post, index) => normalizeAnalyticsRecord(mockMetricsForPost(post, index)));
  return [...normalized, ...fallbackPosts];
}

function sumMetrics(records = []) {
  const totals = METRIC_KEYS.reduce((map, key) => {
    map[key] = records.reduce((total, record) => total + number(record[key]), 0);
    return map;
  }, {});
  totals.engagementRate = deriveEngagementRate(totals);
  totals.recordCount = records.length;
  return totals;
}

function groupBy(records = [], keyFn) {
  return records.reduce((map, record) => {
    const key = keyFn(record) || 'Unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
    return map;
  }, new Map());
}

function nameFromRecord(value, fallback = 'Unknown') {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  return value.name || value.title || value.accountName || value._id?.toString?.() || fallback;
}

function compactDateHour(record = {}) {
  const date = new Date(metricDateFor(record));
  if (Number.isNaN(date.getTime())) return 'Any time';
  const hour = date.getHours();
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${suffix}`;
}

function chartRowsFromGroups(groups, labelKey = 'label') {
  return [...groups.entries()]
    .map(([label, records]) => {
      const totals = sumMetrics(records);
      return {
        [labelKey]: label,
        value: totals.impressions || totals.reach || totals.views,
        engagementRate: totals.engagementRate,
        records: records.length
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function detailMetrics(record = {}) {
  return {
    Impressions: record.impressions,
    Reach: record.reach,
    Views: record.views,
    'Watch time': record.watchTimeSeconds ? `${Math.round(record.watchTimeSeconds / 60)} min` : '',
    Likes: record.likes,
    Comments: record.comments,
    Shares: record.shares,
    Saves: record.saves,
    Clicks: record.clicks,
    'Followers gained': record.followersGained,
    'Engagement rate': `${record.engagementRate.toFixed(2)}%`,
    Source: record.source
  };
}

function recommendationCards(records = [], bestPlatform = '') {
  const totals = sumMetrics(records);
  const recommendations = [];
  if (!records.length) {
    recommendations.push('Publish or sync at least one post to start analytics recommendations.');
  }
  if (bestPlatform) {
    recommendations.push(`Prioritize ${bestPlatform} when planning the next campaign; it has the strongest recent engagement score.`);
  }
  if (totals.clicks < Math.max(5, totals.impressions / 120)) {
    recommendations.push('Add a clearer CTA and link destination to posts where traffic is the goal.');
  }
  if (totals.saves < totals.likes / 5) {
    recommendations.push('Test save-friendly carousel tips, checklists, and product guides.');
  }
  if (totals.watchTimeSeconds > 0) {
    recommendations.push('Reuse the strongest video hooks in reels, shorts, and TikTok scripts.');
  }
  return [...new Set(recommendations)].slice(0, 5);
}

function metricCard(title, description, tag, details = {}) {
  return {
    id: '',
    kind: 'analytics',
    title,
    description,
    tag,
    status: tag,
    details: {
      Title: title,
      Description: description,
      Status: tag,
      ...details
    }
  };
}

function buildAnalyticsDashboard({ analyticsRecords = [], posts = [], campaigns = [], socialAccounts = [] } = {}) {
  const records = analyticsRecordsWithFallback({ analyticsRecords, posts });
  const totals = sumMetrics(records);
  const ranked = [...records].sort((a, b) => b.score - a.score);
  const platformGroups = groupBy(records, (record) => record.platform);
  const campaignGroups = groupBy(records.filter((record) => record.campaign), (record) => nameFromRecord(record.campaign, 'Campaign'));
  const accountGroups = groupBy(records, (record) => nameFromRecord(record.account, record.platform));
  const timeGroups = groupBy(records, compactDateHour);
  const platformChart = chartRowsFromGroups(platformGroups, 'platform');
  const bestPlatform = platformChart[0]?.platform || '';
  const bestTime = chartRowsFromGroups(timeGroups, 'time')[0]?.time || 'Any time';

  const postCards = ranked.slice(0, 8).map((record) => metricCard(
    record.post?.title || record.post?.caption || `${record.platform} post`,
    `${record.platform} - ${record.impressions} impressions - ${record.engagementRate.toFixed(2)}% engagement.`,
    record.source === 'mock' ? 'Mock analytics' : 'Post analytics',
    {
      Brand: nameFromRecord(record.brand, 'Brand'),
      Campaign: nameFromRecord(record.campaign, ''),
      Platform: record.platform,
      Post: nameFromRecord(record.post, ''),
      ...detailMetrics(record)
    }
  ));

  const campaignCards = [...campaignGroups.entries()].slice(0, 6).map(([name, items]) => {
    const campaignTotals = sumMetrics(items);
    return metricCard(
      name,
      `${campaignTotals.impressions} impressions across ${items.length} tracked campaign post${items.length === 1 ? '' : 's'}.`,
      'Campaign analytics',
      detailMetrics(campaignTotals)
    );
  });

  const accountCards = [...accountGroups.entries()].slice(0, 6).map(([name, items]) => {
    const accountTotals = sumMetrics(items);
    return metricCard(
      name,
      `${accountTotals.reach} reach and ${accountTotals.followersGained} follower${accountTotals.followersGained === 1 ? '' : 's'} gained.`,
      'Account analytics',
      detailMetrics(accountTotals)
    );
  });

  const recommendationItems = recommendationCards(records, bestPlatform);
  const recommendationCardList = recommendationItems.map((item, index) =>
    metricCard(`Recommendation ${index + 1}`, item, 'Recommendation')
  );

  return {
    totals,
    records,
    bestPlatform,
    bestTime,
    stats: [
      [totals.impressions, 'Impressions', 'Tracked or mocked'],
      [totals.reach, 'Reach', 'Audience'],
      [`${totals.engagementRate.toFixed(2)}%`, 'Engagement', 'Average'],
      [totals.followersGained, 'Followers gained', 'Growth']
    ],
    cards: [...postCards, ...campaignCards, ...accountCards, ...recommendationCardList],
    rows: ranked.slice(0, 12).map((record) => [
      record.post?.title || record.post?.caption || `${record.platform} post`,
      `${record.platform} - ${record.impressions} impressions - ${record.likes} likes - ${record.clicks} clicks`,
      `${record.engagementRate.toFixed(2)}%`
    ]),
    charts: {
      platforms: platformChart,
      times: chartRowsFromGroups(timeGroups, 'time'),
      campaigns: chartRowsFromGroups(campaignGroups, 'campaign')
    },
    recommendations: recommendationItems,
    exportUrl: '/dashboard/analytics/export.csv',
    empty: !records.length,
    hasMockData: records.some((record) => record.source === 'mock'),
    campaignCount: campaigns.length,
    accountCount: socialAccounts.length
  };
}

function csvEscape(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvForAnalyticsRecords(records = []) {
  const headers = [
    'date', 'source', 'brand', 'campaign', 'post', 'platform',
    'impressions', 'reach', 'views', 'watch_time_seconds',
    'likes', 'comments', 'shares', 'saves', 'clicks',
    'followers_gained', 'engagement_rate'
  ];
  const rows = records.map((record) => {
    const normalized = normalizeAnalyticsRecord(record);
    return [
      new Date(normalized.metricDate).toISOString(),
      normalized.source,
      nameFromRecord(normalized.brand, ''),
      nameFromRecord(normalized.campaign, ''),
      nameFromRecord(normalized.post, ''),
      normalized.platform,
      normalized.impressions,
      normalized.reach,
      normalized.views,
      normalized.watchTimeSeconds,
      normalized.likes,
      normalized.comments,
      normalized.shares,
      normalized.saves,
      normalized.clicks,
      normalized.followersGained,
      normalized.engagementRate
    ].map(csvEscape).join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

module.exports = {
  analyticsRecordsWithFallback,
  analyticsScore,
  buildAnalyticsDashboard,
  csvForAnalyticsRecords,
  deriveEngagementRate,
  mockMetricsForPost,
  normalizeAnalyticsRecord,
  sumMetrics
};

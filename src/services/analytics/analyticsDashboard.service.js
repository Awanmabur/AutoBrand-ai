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

const ENGAGEMENT_KEYS = ['likes', 'comments', 'shares', 'saves', 'clicks'];
const BASE_KEYS = ['impressions', 'reach', 'views'];

function normalizedAvailableMetrics(record = {}) {
  if (Array.isArray(record.availableMetrics) && record.availableMetrics.length) {
    return [...new Set(record.availableMetrics
      .map((key) => String(key || '').trim())
      .filter((key) => METRIC_KEYS.includes(key) || key === 'engagementRate'))];
  }
  // Legacy analytics rows predate provider capability tracking. Every new provider
  // synchronization writes the exact supported set, so only legacy rows use this fallback.
  return [...METRIC_KEYS, 'engagementRate'];
}

function metricIsAvailable(record = {}, key) {
  const available = Array.isArray(record.availableMetrics) && record.availableMetrics.length
    ? record.availableMetrics
    : normalizedAvailableMetrics(record);
  return available.includes(key);
}

function displayMetric(record = {}, key) {
  return metricIsAvailable(record, key) ? String(number(record[key])) : 'Unavailable';
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordId(record) {
  return record?._id?.toString?.() || record?.id?.toString?.() || '';
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
    summary: record.summary || '',
    availableMetrics: normalizedAvailableMetrics(record)
  };

  METRIC_KEYS.forEach((key) => {
    normalized[key] = number(record[key]);
  });
  const canDeriveEngagement = BASE_KEYS.some((key) => metricIsAvailable(normalized, key))
    && ENGAGEMENT_KEYS.some((key) => metricIsAvailable(normalized, key));
  normalized.engagementRate = metricIsAvailable(normalized, 'engagementRate')
    ? number(record.engagementRate)
    : (canDeriveEngagement ? deriveEngagementRate(normalized) : 0);
  if (canDeriveEngagement && !metricIsAvailable(normalized, 'engagementRate')) normalized.availableMetrics.push('engagementRate');
  normalized.score = analyticsScore(normalized);
  return normalized;
}

function analyticsRecordsWithFallback({ analyticsRecords = [] } = {}) {
  // Never fabricate performance data. Missing provider analytics stay missing so
  // dashboards can distinguish "not synced yet" from real zero performance.
  return analyticsRecords.map(normalizeAnalyticsRecord);
}

function awaitingAnalyticsPosts({ analyticsRecords = [], posts = [], analyticsSyncJobs = [] } = {}) {
  const trackedIds = new Set(analyticsRecords.map((record) => recordId(record.post)).filter(Boolean));
  const unsupportedIds = new Set(analyticsSyncJobs.filter((job) => job?.status === 'unsupported').map((job) => recordId(job.post)).filter(Boolean));
  const seen = new Set();
  return posts.filter((post) => {
    if (!post) return false;
    const id = recordId(post);
    if (id && (trackedIds.has(id) || unsupportedIds.has(id) || seen.has(id))) return false;
    if (id) seen.add(id);
    return ['published', 'partially_published'].includes(String(post.status || '').toLowerCase());
  });
}

function sumMetrics(records = []) {
  const availableCounts = {};
  const totals = METRIC_KEYS.reduce((map, key) => {
    const available = records.filter((record) => metricIsAvailable(record, key));
    availableCounts[key] = available.length;
    map[key] = available.reduce((total, record) => total + number(record[key]), 0);
    return map;
  }, {});
  const baseAvailable = BASE_KEYS.some((key) => availableCounts[key] > 0);
  const engagementAvailable = ENGAGEMENT_KEYS.some((key) => availableCounts[key] > 0);
  totals.engagementRate = baseAvailable && engagementAvailable ? deriveEngagementRate(totals) : 0;
  availableCounts.engagementRate = records.filter((record) => metricIsAvailable(record, 'engagementRate')).length || (baseAvailable && engagementAvailable ? records.length : 0);
  totals.availableCounts = availableCounts;
  totals.availableMetrics = [...METRIC_KEYS.filter((key) => availableCounts[key] > 0), ...(availableCounts.engagementRate > 0 ? ['engagementRate'] : [])];
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
  const result = {
    Impressions: displayMetric(record, 'impressions'),
    Reach: displayMetric(record, 'reach'),
    Views: displayMetric(record, 'views'),
    'Watch time': metricIsAvailable(record, 'watchTimeSeconds') ? `${Math.round(number(record.watchTimeSeconds) / 60)} min` : 'Unavailable',
    Likes: displayMetric(record, 'likes'),
    Comments: displayMetric(record, 'comments'),
    Shares: displayMetric(record, 'shares'),
    Saves: displayMetric(record, 'saves'),
    Clicks: displayMetric(record, 'clicks'),
    'Followers gained': displayMetric(record, 'followersGained'),
    'Engagement rate': metricIsAvailable(record, 'engagementRate') ? `${number(record.engagementRate).toFixed(2)}%` : 'Unavailable',
    Source: record.source
  };
  return result;
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
  if (totals.availableCounts.clicks > 0 && totals.availableCounts.impressions > 0 && totals.clicks < Math.max(5, totals.impressions / 120)) {
    recommendations.push('Add a clearer CTA and link destination to posts where traffic is the goal.');
  }
  if (totals.availableCounts.saves > 0 && totals.availableCounts.likes > 0 && totals.saves < totals.likes / 5) {
    recommendations.push('Test save-friendly carousel tips, checklists, and product guides.');
  }
  if (totals.availableCounts.watchTimeSeconds > 0 && totals.watchTimeSeconds > 0) {
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

function buildAnalyticsDashboard({ analyticsRecords = [], posts = [], campaigns = [], socialAccounts = [], analyticsSyncJobs = [] } = {}) {
  const records = analyticsRecordsWithFallback({ analyticsRecords });
  const awaitingPosts = awaitingAnalyticsPosts({ analyticsRecords, posts, analyticsSyncJobs });
  const unsupportedJobs = analyticsSyncJobs.filter((job) => job?.status === 'unsupported');
  const retryJobs = analyticsSyncJobs.filter((job) => ['retry', 'running', 'queued'].includes(String(job?.status || '')));
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
    `${record.platform} - ${displayMetric(record, 'impressions')} impressions - ${metricIsAvailable(record, 'engagementRate') ? `${record.engagementRate.toFixed(2)}% engagement` : 'engagement unavailable'}.`,
    'Post analytics',
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
      [totals.availableCounts.impressions ? totals.impressions : 'Unavailable', 'Impressions', records.length ? 'Provider synced' : 'Awaiting sync'],
      [totals.availableCounts.reach ? totals.reach : 'Unavailable', 'Reach', 'Audience'],
      [totals.availableCounts.engagementRate ? `${totals.engagementRate.toFixed(2)}%` : 'Unavailable', 'Engagement', 'Measured/derived'],
      [totals.availableCounts.followersGained ? totals.followersGained : 'Unavailable', 'Followers gained', 'Growth']
    ],
    cards: [...postCards, ...campaignCards, ...accountCards, ...recommendationCardList],
    rows: ranked.slice(0, 12).map((record) => [
      record.post?.title || record.post?.caption || `${record.platform} post`,
      `${record.platform} - ${displayMetric(record, 'impressions')} impressions - ${displayMetric(record, 'likes')} likes - ${displayMetric(record, 'clicks')} clicks`,
      metricIsAvailable(record, 'engagementRate') ? `${record.engagementRate.toFixed(2)}%` : 'Unavailable'
    ]),
    charts: {
      platforms: platformChart,
      times: chartRowsFromGroups(timeGroups, 'time'),
      campaigns: chartRowsFromGroups(campaignGroups, 'campaign')
    },
    recommendations: recommendationItems,
    exportUrl: '/dashboard/analytics/export.csv',
    empty: !records.length,
    awaitingSyncCount: awaitingPosts.length,
    unavailableSyncCount: unsupportedJobs.length,
    retrySyncCount: retryJobs.length,
    awaitingPosts: awaitingPosts.slice(0, 12).map((post) => ({ id: recordId(post), title: post.title || post.caption || 'Published post', platform: post.platform || 'unknown' })),
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
      metricIsAvailable(normalized, 'impressions') ? normalized.impressions : '',
      metricIsAvailable(normalized, 'reach') ? normalized.reach : '',
      metricIsAvailable(normalized, 'views') ? normalized.views : '',
      metricIsAvailable(normalized, 'watchTimeSeconds') ? normalized.watchTimeSeconds : '',
      metricIsAvailable(normalized, 'likes') ? normalized.likes : '',
      metricIsAvailable(normalized, 'comments') ? normalized.comments : '',
      metricIsAvailable(normalized, 'shares') ? normalized.shares : '',
      metricIsAvailable(normalized, 'saves') ? normalized.saves : '',
      metricIsAvailable(normalized, 'clicks') ? normalized.clicks : '',
      metricIsAvailable(normalized, 'followersGained') ? normalized.followersGained : '',
      metricIsAvailable(normalized, 'engagementRate') ? normalized.engagementRate : ''
    ].map(csvEscape).join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

module.exports = {
  analyticsRecordsWithFallback,
  awaitingAnalyticsPosts,
  analyticsScore,
  buildAnalyticsDashboard,
  csvForAnalyticsRecords,
  deriveEngagementRate,
  metricIsAvailable,
  normalizeAnalyticsRecord,
  sumMetrics
};

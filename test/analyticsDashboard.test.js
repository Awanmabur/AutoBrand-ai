const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyticsRecordsWithFallback,
  buildAnalyticsDashboard,
  csvForAnalyticsRecords,
  deriveEngagementRate,
  mockMetricsForPost,
  sumMetrics
} = require('../src/services/analytics/analyticsDashboard.service');

test('analytics dashboard derives engagement and full metric totals', () => {
  const totals = sumMetrics([
    { impressions: 1000, reach: 700, views: 400, likes: 50, comments: 10, shares: 5, saves: 8, clicks: 20, followersGained: 3, watchTimeSeconds: 1200 },
    { impressions: 500, reach: 300, views: 120, likes: 15, comments: 3, shares: 1, saves: 2, clicks: 8, followersGained: 1, watchTimeSeconds: 0 }
  ]);

  assert.equal(totals.impressions, 1500);
  assert.equal(totals.saves, 10);
  assert.equal(totals.followersGained, 4);
  assert.equal(deriveEngagementRate(totals), totals.engagementRate);
});

test('analytics fallback creates deterministic mock metrics for posts without provider analytics', () => {
  const post = {
    _id: 'post-1',
    title: 'Launch reel',
    platform: 'tiktok',
    type: 'reel',
    publishedAt: new Date('2030-01-01T10:00:00Z')
  };

  const first = mockMetricsForPost(post);
  const second = mockMetricsForPost(post);
  const records = analyticsRecordsWithFallback({ analyticsRecords: [], posts: [post, post] });

  assert.equal(first.impressions, second.impressions);
  assert.equal(first.source, 'mock');
  assert.equal(records.length, 1);
});

test('analytics dashboard builds cards, charts and CSV export rows', () => {
  const analyticsRecords = [{
    brand: { name: 'AutoBrand' },
    campaign: { name: 'Launch' },
    post: { title: 'Offer post', platform: 'facebook' },
    platform: 'facebook',
    source: 'provider',
    metricDate: new Date('2030-01-02T09:00:00Z'),
    impressions: 1000,
    reach: 800,
    views: 500,
    likes: 60,
    comments: 12,
    shares: 8,
    saves: 10,
    clicks: 40,
    followersGained: 4
  }];

  const dashboard = buildAnalyticsDashboard({ analyticsRecords, posts: [], campaigns: [{ name: 'Launch' }], socialAccounts: [] });
  const csv = csvForAnalyticsRecords(dashboard.records);

  assert.equal(dashboard.bestPlatform, 'facebook');
  assert.ok(dashboard.cards.some((card) => card.tag === 'Campaign analytics'));
  assert.ok(dashboard.charts.platforms.length);
  assert.match(csv, /impressions,reach,views/);
  assert.match(csv, /Offer post/);
});

const { fetchFacebookPostMetrics } = require('../facebookService');
const { fetchInstagramPostMetrics } = require('../instagramService');
const { fetchLinkedInPostMetrics } = require('../linkedinService');
const { fetchPinterestPostMetrics } = require('../pinterestService');
const { fetchXPostMetrics } = require('../xService');
const { fetchThreadsPostMetrics } = require('../threadsService');
const { fetchTikTokPostMetrics } = require('../tiktokService');
const { fetchYouTubePostMetrics } = require('../youtubeService');

class ProviderAnalyticsUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderAnalyticsUnsupportedError';
    this.code = 'ANALYTICS_UNSUPPORTED';
    this.permanent = true;
  }
}

const FETCHERS = {
  facebook: fetchFacebookPostMetrics,
  instagram: fetchInstagramPostMetrics,
  linkedin: fetchLinkedInPostMetrics,
  pinterest: fetchPinterestPostMetrics,
  x: fetchXPostMetrics,
  threads: fetchThreadsPostMetrics,
  tiktok: fetchTikTokPostMetrics,
  youtube: fetchYouTubePostMetrics
};

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function sanitizeMetrics(metrics = {}) {
  const output = {
    providerPostId: String(metrics.providerPostId || '').trim(),
    providerPostUrl: String(metrics.providerPostUrl || '').trim(),
    publicationComplete: Boolean(metrics.publicationComplete),
    availableMetrics: [...new Set((metrics.availableMetrics || []).map((item) => String(item || '').trim()).filter(Boolean))]
  };
  [
    'impressions', 'views', 'watchTimeSeconds', 'likes', 'comments', 'shares',
    'saves', 'clicks', 'reach', 'followersGained', 'engagementRate'
  ].forEach((key) => {
    const value = numeric(metrics[key]);
    if (value !== undefined) output[key] = value;
  });
  if (!output.availableMetrics.length) {
    output.availableMetrics = Object.keys(output).filter((key) => !['providerPostId', 'providerPostUrl', 'publicationComplete', 'availableMetrics'].includes(key));
  }
  return output;
}

async function fetchProviderMetrics({ platform, account, platformPostId, post }) {
  const normalized = String(platform || account?.platform || '').trim().toLowerCase();
  const fetcher = FETCHERS[normalized];
  if (!fetcher) {
    throw new ProviderAnalyticsUnsupportedError(
      normalized === 'google_business'
        ? 'Google Business Profile does not expose the same per-post organic metrics contract used by AutoBrand post analytics.'
        : `Per-post analytics are unavailable for ${normalized || 'this provider'} because AutoBrand does not have a supported provider metrics contract for it.`
    );
  }
  const metrics = await fetcher({
    account,
    platformPostId,
    post,
    publishedAt: post?.publishedAt || post?.createdAt
  });
  return sanitizeMetrics(metrics);
}

module.exports = {
  ProviderAnalyticsUnsupportedError,
  fetchProviderMetrics,
  sanitizeMetrics
};

const RETRY_POLICY = {
  default: { maxRetries: 3, delayMinutes: [5, 20, 60] },
  facebook: { maxRetries: 3, delayMinutes: [5, 20, 60] },
  instagram: { maxRetries: 3, delayMinutes: [10, 30, 90] },
  google_business: { maxRetries: 3, delayMinutes: [10, 30, 90] },
  linkedin: { maxRetries: 3, delayMinutes: [10, 30, 90] },
  pinterest: { maxRetries: 3, delayMinutes: [10, 30, 90] },
  threads: { maxRetries: 3, delayMinutes: [10, 30, 90] },
  x: { maxRetries: 3, delayMinutes: [10, 30, 90] },
  tiktok: { maxRetries: 2, delayMinutes: [15, 60] },
  youtube: { maxRetries: 2, delayMinutes: [15, 60] }
};

const PERMANENT_ERROR_PATTERNS = [
  /missing/i,
  /not configured/i,
  /reconnect/i,
  /invalid token/i,
  /permission/i,
  /requires?/i,
  /no connected/i,
  /not return an access token/i,
  /not support/i,
  /expected .* but received/i
];

function policyFor(platform) {
  return RETRY_POLICY[platform] || RETRY_POLICY.default;
}

function isRetryablePublishingError(errorOrMessage) {
  const message = String(errorOrMessage?.message || errorOrMessage || '');
  if (!message) return true;
  return !PERMANENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function retryAtFor(post) {
  const policy = policyFor(post.platform);
  const attempt = Math.max(0, Number(post.retryCount || 0));
  const delayMinutes = policy.delayMinutes[Math.min(attempt, policy.delayMinutes.length - 1)] || 60;
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

async function applyRetryPolicy(post, errorOrMessage) {
  const policy = policyFor(post.platform);
  const message = String(errorOrMessage?.message || errorOrMessage || 'Publishing failed.');
  const retryable = isRetryablePublishingError(message);
  const retryCount = Number(post.retryCount || 0);

  post.platformMetadata = {
    ...(post.platformMetadata || {}),
    retry: {
      ...(post.platformMetadata?.retry || {}),
      lastError: message,
      retryable,
      maxRetries: policy.maxRetries,
      lastCheckedAt: new Date()
    }
  };

  if (!retryable || retryCount >= policy.maxRetries) {
    post.status = 'failed';
    post.errorMessage = message;
    post.platformMetadata.retry.exhaustedAt = !retryable ? undefined : new Date();
    post.platformMetadata.retry.reason = retryable ? 'max_retries_reached' : 'permanent_error';
    await post.save();
    return { scheduled: false, retryable, exhausted: retryable };
  }

  const nextRetryAt = retryAtFor(post);
  post.retryCount = retryCount + 1;
  post.status = 'scheduled';
  post.scheduledAt = nextRetryAt;
  post.errorMessage = message;
  post.platformMetadata.retry.nextRetryAt = nextRetryAt;
  post.platformMetadata.retry.reason = 'temporary_error';
  await post.save();
  return { scheduled: true, retryable, nextRetryAt, retryCount: post.retryCount };
}

module.exports = { RETRY_POLICY, applyRetryPolicy, isRetryablePublishingError, policyFor };

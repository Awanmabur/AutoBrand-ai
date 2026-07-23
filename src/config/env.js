try { require('dotenv').config(); } catch (error) { /* dotenv is optional in test/runtime bundles */ }

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { durationToMs } = require('../utils/duration');

function cleanEnv(value) {
  return String(value || '').trim();
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

const nodeEnv = cleanEnv(process.env.NODE_ENV) || 'development';
const configuredAppUrl = cleanEnv(process.env.APP_URL || process.env.PUBLIC_APP_URL).replace(/\/+$/, '');
const defaultAppUrl = configuredAppUrl || `http://localhost:${process.env.PORT || 3200}`;
const aiGenerationWorkerMode = (cleanEnv(process.env.AI_GENERATION_WORKER_MODE) || 'web').toLowerCase();
const publishingPaused = boolEnv(process.env.PAUSE_PUBLISHING, false);
const ephemeralSecrets = new Map();
function secretEnv(name) {
  const configured = cleanEnv(process.env[name]);
  if (configured) return configured;
  if (nodeEnv === 'production') return '';
  if (!ephemeralSecrets.has(name)) ephemeralSecrets.set(name, crypto.randomBytes(48).toString('base64url'));
  return ephemeralSecrets.get(name);
}

function parseSecretList(value) {
  return String(value || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveTokenEncryptionSecret() {
  const configured = cleanEnv(process.env.TOKEN_ENCRYPTION_KEY);
  if (configured) return { value: configured, source: 'environment', configured: true, filePath: '' };
  if (nodeEnv === 'production') return { value: '', source: 'missing', configured: false, filePath: '' };
  if (nodeEnv === 'test') {
    return { value: secretEnv('TOKEN_ENCRYPTION_KEY'), source: 'ephemeral_test', configured: false, filePath: '' };
  }

  const filePath = path.resolve(cleanEnv(process.env.TOKEN_ENCRYPTION_KEY_FILE) || path.join(process.cwd(), '.autobrand-token-key'));
  try {
    const existing = cleanEnv(fs.readFileSync(filePath, 'utf8'));
    if (existing.length >= 32) return { value: existing, source: 'development_file', configured: false, filePath };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[security] development token key could not be read', { filePath, message: error.message });
    }
  }

  const generated = crypto.randomBytes(48).toString('base64url');
  try {
    fs.writeFileSync(filePath, `${generated}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try { fs.chmodSync(filePath, 0o600); } catch (_error) { /* best effort on Windows */ }
    console.warn('[security] generated a persistent local TOKEN_ENCRYPTION_KEY', { filePath });
    return { value: generated, source: 'development_file', configured: false, filePath };
  } catch (error) {
    if (error.code === 'EEXIST') {
      const existing = cleanEnv(fs.readFileSync(filePath, 'utf8'));
      if (existing.length >= 32) return { value: existing, source: 'development_file', configured: false, filePath };
    }
    console.warn('[security] using an ephemeral TOKEN_ENCRYPTION_KEY because the local key file could not be created', {
      filePath,
      message: error.message
    });
    return { value: secretEnv('TOKEN_ENCRYPTION_KEY'), source: 'ephemeral_fallback', configured: false, filePath };
  }
}

const tokenEncryptionSecret = resolveTokenEncryptionSecret();

const smtpHost = cleanEnv(process.env.SMTP_HOST);
const smtpUser = cleanEnv(process.env.SMTP_USER);
const smtpPass = cleanEnv(process.env.SMTP_PASS);
const emailFrom = cleanEnv(process.env.EMAIL_FROM);
const smtpConfigured = Boolean(smtpHost && smtpUser && smtpPass && emailFrom);
const emailDeliveryMode = (cleanEnv(process.env.EMAIL_DELIVERY_MODE) || 'optional').toLowerCase();
const emailDeliveryEnabled = emailDeliveryMode !== 'disabled' && smtpConfigured;
const emailVerificationRequired = boolEnv(process.env.EMAIL_VERIFICATION_REQUIRED, emailDeliveryEnabled);

const env = {
  appName: process.env.APP_NAME || 'AutoBrand AI',
  appUrl: defaultAppUrl,
  port: Number(process.env.PORT || 3200),
  nodeEnv,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ai-autobrand',
  aiTextProvider: process.env.AI_TEXT_PROVIDER || 'openai',
  aiImageProvider: process.env.AI_IMAGE_PROVIDER || 'openai',
  aiVideoProvider: process.env.AI_VIDEO_PROVIDER || 'openai',
  publicAppUrl: cleanEnv(process.env.PUBLIC_APP_URL || process.env.APP_URL),
  generatedMediaStorage: (cleanEnv(process.env.GENERATED_MEDIA_STORAGE) || 'gridfs').toLowerCase(),
  generatedMediaGridFsBucket: cleanEnv(process.env.GENERATED_MEDIA_GRIDFS_BUCKET) || 'autobrand_generated_media',
  // Publishing is a core runtime responsibility. The legacy ENABLE_SCHEDULED_PUBLISHING
  // flag could silently strand both scheduled and immediate posts in existing deployments.
  // Use PAUSE_PUBLISHING=true only for an intentional emergency stop.
  publishingPaused,
  scheduledPublishingEnabled: !publishingPaused,
  legacyScheduledPublishingDisabled: cleanEnv(process.env.ENABLE_SCHEDULED_PUBLISHING).toLowerCase() === 'false',

  superadminName: cleanEnv(process.env.SUPERADMIN_NAME),
  superadminEmail: cleanEnv(process.env.SUPERADMIN_EMAIL),
  superadminPassword: cleanEnv(process.env.SUPERADMIN_PASSWORD),
  billingProvider: cleanEnv(process.env.BILLING_PROVIDER) || 'pesapal',
  checkoutDefaultProvider: cleanEnv(process.env.CHECKOUT_DEFAULT_PROVIDER) || cleanEnv(process.env.BILLING_PROVIDER) || 'pesapal',
  pesapalEnvironment: cleanEnv(process.env.PESAPAL_ENVIRONMENT || process.env.PESAPAL_MODE) || 'sandbox',
  pesapalBaseUrl: cleanEnv(process.env.PESAPAL_BASE_URL),
  pesapalConsumerKey: cleanEnv(process.env.PESAPAL_CONSUMER_KEY),
  pesapalConsumerSecret: cleanEnv(process.env.PESAPAL_CONSUMER_SECRET),
  pesapalIpnId: cleanEnv(process.env.PESAPAL_IPN_ID || process.env.PESAPAL_NOTIFICATION_ID),
  pesapalIpnUrl: cleanEnv(process.env.PESAPAL_IPN_URL),
  pesapalCallbackUrl: cleanEnv(process.env.PESAPAL_CALLBACK_URL),
  pesapalCancellationUrl: cleanEnv(process.env.PESAPAL_CANCELLATION_URL),
  pesapalRedirectMode: cleanEnv(process.env.PESAPAL_REDIRECT_MODE) || 'TOP_WINDOW',
  pesapalIpnNotificationType: cleanEnv(process.env.PESAPAL_IPN_NOTIFICATION_TYPE) || 'POST',
  pesapalAutoRegisterIpn: String(process.env.PESAPAL_AUTO_REGISTER_IPN || '').toLowerCase() === 'true',
  pesapalBranch: cleanEnv(process.env.PESAPAL_BRANCH) || '',
  pesapalTimeoutMs: Number(process.env.PESAPAL_TIMEOUT_MS || 30000),
  deepseekApiKey: cleanEnv(process.env.DEEPSEEK_API_KEY),
  deepseekTextModel: cleanEnv(process.env.DEEPSEEK_TEXT_MODEL) || 'deepseek-chat',
  groqApiKey: cleanEnv(process.env.GROQ_API_KEY),
  groqTextModel: cleanEnv(process.env.GROQ_TEXT_MODEL) || 'llama-3.3-70b-versatile',
  anthropicApiKey: cleanEnv(process.env.ANTHROPIC_API_KEY),
  anthropicTextModel: cleanEnv(process.env.ANTHROPIC_TEXT_MODEL) || 'claude-3-5-sonnet-latest',
  mistralApiKey: cleanEnv(process.env.MISTRAL_API_KEY),
  mistralTextModel: cleanEnv(process.env.MISTRAL_TEXT_MODEL) || 'mistral-large-latest',
  stabilityApiKey: cleanEnv(process.env.STABILITY_API_KEY),
  stabilityImageModel: cleanEnv(process.env.STABILITY_IMAGE_MODEL) || 'stable-image-core',
  falApiKey: cleanEnv(process.env.FAL_API_KEY),
  falImageModel: cleanEnv(process.env.FAL_IMAGE_MODEL) || 'fal-ai/flux/schnell',
  falVideoModel: cleanEnv(process.env.FAL_VIDEO_MODEL) || 'fal-ai/video',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiTextModel: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview',
  replicateApiToken: process.env.REPLICATE_API_TOKEN || '',
  replicateImageModel: process.env.REPLICATE_IMAGE_MODEL || 'black-forest-labs/flux-schnell',
  replicateVideoModel: process.env.REPLICATE_VIDEO_MODEL || 'alibaba/happyhorse-1.0',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  openaiImageSize: process.env.OPENAI_IMAGE_SIZE || '1024x1024',
  openaiQuality: process.env.OPENAI_QUALITY || 'medium',
  openaiVideoModel: process.env.OPENAI_VIDEO_MODEL || 'sora-2',
  openaiVideoSize: process.env.OPENAI_VIDEO_SIZE || '',
  openaiVideoSeconds: process.env.OPENAI_VIDEO_SECONDS || '',
  allowLocalImageFallback: boolEnv(process.env.ALLOW_LOCAL_IMAGE_FALLBACK, false),
  allowLocalVideoFallback: boolEnv(process.env.ALLOW_LOCAL_VIDEO_FALLBACK, nodeEnv !== 'production'),
  // The web process owns generation by default so a one-service deployment works.
  // Set AI_GENERATION_WORKER_MODE=external only when a dedicated aiworker is actually running,
  // or =off for an intentional maintenance pause. Legacy false flags are retained as warnings.
  aiGenerationWorkerMode,
  aiGenerationWorkerEnabled: aiGenerationWorkerMode !== 'off',
  runAiGenerationWorkerInWeb: aiGenerationWorkerMode === 'web',
  legacyAiWorkerDisabledInWeb: cleanEnv(process.env.RUN_AI_GENERATION_WORKER_IN_WEB).toLowerCase() === 'false',
  aiGenerationPollMs: Math.max(1000, Number(process.env.AI_GENERATION_POLL_MS || 2500)),
  aiGenerationConcurrency: Math.max(1, Math.min(4, Number(process.env.AI_GENERATION_CONCURRENCY || 2))),
  aiContentGenerationConcurrency: Math.max(1, Math.min(4, Number(process.env.AI_CONTENT_GENERATION_CONCURRENCY || process.env.AI_GENERATION_CONCURRENCY || 2))),
  aiVideoGenerationConcurrency: Math.max(1, Math.min(2, Number(process.env.AI_VIDEO_GENERATION_CONCURRENCY || 1))),
  aiImageGenerationConcurrency: Math.max(1, Math.min(3, Number(process.env.AI_IMAGE_GENERATION_CONCURRENCY || 3))),
  imageMagickBinary: process.env.IMAGE_MAGICK_BINARY || '',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
  googleClientId: cleanEnv(process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: cleanEnv(process.env.GOOGLE_CLIENT_SECRET),
  googleCallbackUrl: cleanEnv(process.env.GOOGLE_CALLBACK_URL) || `${defaultAppUrl}/auth/google/callback`,
  googleOAuthTimeoutMs: Number(process.env.GOOGLE_OAUTH_TIMEOUT_MS || 30000),
  googleOAuthConnectTimeoutMs: Number(process.env.GOOGLE_OAUTH_CONNECT_TIMEOUT_MS || process.env.GOOGLE_OAUTH_TIMEOUT_MS || 30000),
  googleOAuthProxy: cleanEnv(process.env.GOOGLE_OAUTH_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY),
  googleOAuthDnsOrder: cleanEnv(process.env.GOOGLE_OAUTH_DNS_ORDER),
  googleOAuthIpFamily: cleanEnv(process.env.GOOGLE_OAUTH_IP_FAMILY),
  googleBusinessClientId: cleanEnv(process.env.GOOGLE_BUSINESS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID),
  googleBusinessClientSecret: cleanEnv(process.env.GOOGLE_BUSINESS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET),
  googleBusinessCallbackUrl: cleanEnv(process.env.GOOGLE_BUSINESS_CALLBACK_URL) || `${defaultAppUrl}/dashboard/actions/social/google-business/callback`,
  googleBusinessScopes: process.env.GOOGLE_BUSINESS_SCOPES || 'https://www.googleapis.com/auth/business.manage',
  linkedinClientId: process.env.LINKEDIN_CLIENT_ID || '',
  linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
  linkedinCallbackUrl: process.env.LINKEDIN_CALLBACK_URL || `${defaultAppUrl}/dashboard/actions/social/linkedin/callback`,
  linkedinScopes: process.env.LINKEDIN_SCOPES || 'openid profile email w_member_social',
  linkedinVersion: process.env.LINKEDIN_VERSION || '202607',
  pinterestClientId: cleanEnv(process.env.PINTEREST_CLIENT_ID),
  pinterestClientSecret: cleanEnv(process.env.PINTEREST_CLIENT_SECRET),
  pinterestCallbackUrl: cleanEnv(process.env.PINTEREST_CALLBACK_URL) || `${defaultAppUrl}/dashboard/actions/social/pinterest/callback`,
  pinterestScopes: process.env.PINTEREST_SCOPES || 'boards:read,pins:read,pins:write,user_accounts:read',
  pinterestContinuousRefresh: String(process.env.PINTEREST_CONTINUOUS_REFRESH || '').toLowerCase() === 'true',
  xClientId: cleanEnv(process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID),
  xClientSecret: cleanEnv(process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET),
  xCallbackUrl: cleanEnv(process.env.X_CALLBACK_URL || process.env.TWITTER_CALLBACK_URL) || `${defaultAppUrl}/dashboard/actions/social/x/callback`,
  xScopes: process.env.X_SCOPES || process.env.TWITTER_SCOPES || 'tweet.read tweet.write users.read offline.access media.write',
  threadsAppId: cleanEnv(process.env.THREADS_APP_ID || process.env.THREADS_CLIENT_ID),
  threadsAppSecret: cleanEnv(process.env.THREADS_APP_SECRET || process.env.THREADS_CLIENT_SECRET),
  threadsCallbackUrl: cleanEnv(process.env.THREADS_CALLBACK_URL) || `${defaultAppUrl}/dashboard/actions/social/threads/callback`,
  threadsScopes: process.env.THREADS_SCOPES || 'threads_basic,threads_content_publish',
  threadsGraphVersion: process.env.THREADS_GRAPH_VERSION || 'v1.0',
  youtubeClientId: cleanEnv(process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID),
  youtubeClientSecret: cleanEnv(process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET),
  youtubeCallbackUrl: cleanEnv(process.env.YOUTUBE_CALLBACK_URL) || `${defaultAppUrl}/dashboard/actions/social/youtube/callback`,
  youtubeScopes: process.env.YOUTUBE_SCOPES || 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
  youtubeDefaultPrivacy: process.env.YOUTUBE_DEFAULT_PRIVACY || 'public',
  tiktokClientKey: cleanEnv(process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_ID),
  tiktokClientSecret: cleanEnv(process.env.TIKTOK_CLIENT_SECRET),
  tiktokCallbackUrl: cleanEnv(process.env.TIKTOK_CALLBACK_URL) || `${defaultAppUrl}/dashboard/actions/social/tiktok/callback`,
  tiktokScopes: process.env.TIKTOK_SCOPES || 'user.info.basic,video.upload,video.publish',
  facebookAppId: process.env.FACEBOOK_APP_ID || '',
  facebookAppSecret: process.env.FACEBOOK_APP_SECRET || '',
  facebookCallbackUrl: process.env.FACEBOOK_CALLBACK_URL || `${defaultAppUrl}/dashboard/actions/social/facebook/callback`,
  facebookGraphVersion: process.env.FACEBOOK_GRAPH_VERSION || 'v25.0',
  facebookScopes: process.env.FACEBOOK_SCOPES || 'pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish',
  facebookLoginConfigId: process.env.FACEBOOK_LOGIN_CONFIG_ID || '',
  facebookAllowClassicOAuth: String(process.env.FACEBOOK_ALLOW_CLASSIC_OAUTH || '').toLowerCase() === 'true',
  facebookAppDomains: (process.env.FACEBOOK_APP_DOMAINS || '')
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean),
  redisUrl: cleanEnv(process.env.REDIS_URL || process.env.REDISCLOUD_URL || process.env.REDIS_TLS_URL),
  // Redis is optional. A hosted URL enables it automatically; host/port mode
  // requires REDIS_ENABLED=true so an empty local Redis installation cannot
  // create an infinite ECONNREFUSED reconnect loop.
  redisEnabled: Boolean(cleanEnv(process.env.REDIS_URL || process.env.REDISCLOUD_URL || process.env.REDIS_TLS_URL))
    || boolEnv(process.env.REDIS_ENABLED, false),
  redisConfigured: (
    Boolean(cleanEnv(process.env.REDIS_URL || process.env.REDISCLOUD_URL || process.env.REDIS_TLS_URL))
    || boolEnv(process.env.REDIS_ENABLED, false)
  ) && Boolean(cleanEnv(process.env.REDIS_URL || process.env.REDISCLOUD_URL || process.env.REDIS_TLS_URL || process.env.REDIS_HOST)),
  redisHost: cleanEnv(process.env.REDIS_HOST) || '127.0.0.1',
  redisPort: Number(process.env.REDIS_PORT || 6379),
  queuePrefix: cleanEnv(process.env.QUEUE_PREFIX) || 'autobrand',
  jwtAccessSecret: secretEnv('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: secretEnv('JWT_REFRESH_SECRET'),
  jwtAccessExpiresIn: cleanEnv(process.env.JWT_ACCESS_EXPIRES_IN) || '15m',
  jwtRefreshExpiresIn: cleanEnv(process.env.JWT_REFRESH_EXPIRES_IN) || '30d',
  jwtAccessMaxAgeMs: durationToMs(process.env.JWT_ACCESS_EXPIRES_IN || '15m', 15 * 60 * 1000),
  jwtRefreshMaxAgeMs: durationToMs(process.env.JWT_REFRESH_EXPIRES_IN || '30d', 30 * 24 * 60 * 60 * 1000),
  jwtIssuer: cleanEnv(process.env.JWT_ISSUER) || 'autobrand-ai',
  jwtAudience: cleanEnv(process.env.JWT_AUDIENCE) || 'autobrand-ai-web',
  cookieSecret: secretEnv('COOKIE_SECRET'),
  csrfSecret: secretEnv('CSRF_SECRET'),
  webhookSecret: secretEnv('WEBHOOK_SECRET'),
  tokenEncryptionKey: tokenEncryptionSecret.value,
  tokenEncryptionKeySource: tokenEncryptionSecret.source,
  tokenEncryptionKeyConfigured: tokenEncryptionSecret.configured,
  tokenEncryptionKeyFile: tokenEncryptionSecret.filePath,
  tokenEncryptionKeyPrevious: parseSecretList(process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS),
  sessionMaxActive: Math.max(1, Math.min(50, Number(process.env.SESSION_MAX_ACTIVE || 10))),
  loginMaxFailures: Math.max(3, Math.min(20, Number(process.env.LOGIN_MAX_FAILURES || 5))),
  loginLockMinutes: Math.max(1, Math.min(1440, Number(process.env.LOGIN_LOCK_MINUTES || 15))),
  smtpHost,
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: boolEnv(process.env.SMTP_SECURE, false),
  smtpUser,
  smtpPass,
  emailFrom,
  smtpConfigured,
  emailDeliveryMode,
  emailDeliveryEnabled,
  emailVerificationRequired,
  allowDevelopmentEmailLinks: boolEnv(process.env.ALLOW_DEVELOPMENT_EMAIL_LINKS, nodeEnv !== 'production'),
  remoteFetchTimeoutMs: Math.max(1000, Math.min(120000, Number(process.env.REMOTE_FETCH_TIMEOUT_MS || 20000))),
  remoteFetchMaxBytes: Math.max(1024 * 1024, Math.min(500 * 1024 * 1024, Number(process.env.REMOTE_FETCH_MAX_BYTES || 100 * 1024 * 1024))),
  maxUploadBytes: Math.max(1024 * 1024, Math.min(500 * 1024 * 1024, Number(process.env.MAX_UPLOAD_BYTES || 100 * 1024 * 1024))),
  trustProxyHops: Math.max(0, Math.min(10, Number(process.env.TRUST_PROXY_HOPS || 1))),
  rateLimitWindowMs: Math.max(1000, Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000)),
  rateLimitMax: Math.max(10, Number(process.env.RATE_LIMIT_MAX || 300))
};

module.exports = env;

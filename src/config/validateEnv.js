const env = require('./env');

const PLACEHOLDER_PATTERNS = [
  /replace[_-]?with/i,
  /change[_-]?me/i,
  /change[_-]?this/i,
  /example\.com/i,
  /your[_-]?domain/i,
  /secret/i
];

function cleanEnvForValidation(value) {
  return String(value || '').trim();
}

function isSecureSecret(value) {
  const text = String(value || '');
  return text.length >= 32 && !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch (_error) {
    return false;
  }
}


function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname) && !url.hostname.endsWith('.localhost');
  } catch (_error) {
    return false;
  }
}



function isValidHostname(value) {
  const text = cleanEnvForValidation(value).toLowerCase();
  if (!text || text.includes('*') || text.includes('/') || text.includes('://') || /\s/.test(text)) return false;
  try {
    const parsed = new URL(`https://${text}`);
    return parsed.hostname === text && !parsed.username && !parsed.password && !parsed.port;
  } catch (_error) {
    return false;
  }
}

function isValidEmail(value) {
  const text = cleanEnvForValidation(value);
  return !text || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 320);
}

function sameHostname(left, right) {
  try {
    return new URL(left).hostname.toLowerCase() === new URL(right).hostname.toLowerCase();
  } catch (_error) {
    return false;
  }
}

function validateEnvironment({ production = env.nodeEnv === 'production' } = {}) {
  const errors = [];
  const warnings = [];

  if (!['development', 'test', 'production'].includes(env.nodeEnv)) errors.push('NODE_ENV must be development, test, or production.');
  if (!['web', 'external', 'off'].includes(env.aiGenerationWorkerMode)) errors.push('AI_GENERATION_WORKER_MODE must be web, external, or off.');
  if (!['web', 'external', 'off'].includes(env.analyticsSyncWorkerMode)) errors.push('ANALYTICS_SYNC_WORKER_MODE must be web, external, or off.');
  if (!['web', 'external', 'off'].includes(env.paymentReconciliationWorkerMode)) errors.push('PAYMENT_RECONCILIATION_WORKER_MODE must be web, external, or off.');
  if (!['web', 'external', 'off'].includes(env.aiBrainWorkerMode)) errors.push('AI_BRAIN_WORKER_MODE must be web, external, or off.');
  if (!['required', 'optional', 'disabled'].includes(env.emailDeliveryMode)) errors.push('EMAIL_DELIVERY_MODE must be required, optional, or disabled.');
  if (!['gridfs', 'cloudinary', 'local'].includes(env.generatedMediaStorage)) errors.push('GENERATED_MEDIA_STORAGE must be gridfs, cloudinary, or local.');
  if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) errors.push('PORT must be between 1 and 65535.');
  if (!env.mongoUri) errors.push('MONGO_URI is required.');
  if (env.jwtRefreshMaxAgeMs <= env.jwtAccessMaxAgeMs) errors.push('JWT_REFRESH_EXPIRES_IN must be longer than JWT_ACCESS_EXPIRES_IN.');
  if (env.mcpEnabled && env.mcpRefreshMaxAgeMs <= env.mcpAccessMaxAgeMs) errors.push('MCP_REFRESH_EXPIRES_IN must be longer than MCP_ACCESS_EXPIRES_IN.');

  if (String(env.billingProvider || '').toLowerCase() !== 'pesapal') errors.push('BILLING_PROVIDER must be pesapal.');
  if (String(env.checkoutDefaultProvider || '').toLowerCase() !== 'pesapal') errors.push('CHECKOUT_DEFAULT_PROVIDER must be pesapal.');
  if (!['sandbox', 'production'].includes(String(env.pesapalEnvironment || '').toLowerCase())) errors.push('PESAPAL_ENVIRONMENT must be sandbox or production.');

  const secrets = {
    JWT_ACCESS_SECRET: env.jwtAccessSecret,
    JWT_REFRESH_SECRET: env.jwtRefreshSecret,
    COOKIE_SECRET: env.cookieSecret,
    CSRF_SECRET: env.csrfSecret,
    WEBHOOK_SECRET: env.webhookSecret,
    MEDIA_URL_SIGNING_SECRET: env.mediaUrlSigningSecret,
    TOKEN_ENCRYPTION_KEY: env.tokenEncryptionKey
  };

  if (production) {
    if (!isHttpsUrl(env.appUrl)) errors.push('APP_URL must be a valid HTTPS URL in production.');
    if (env.publicAppUrl && !isHttpsUrl(env.publicAppUrl)) errors.push('PUBLIC_APP_URL must be a valid HTTPS URL in production.');
    for (const host of env.allowedHosts || []) {
      if (!isValidHostname(host)) errors.push(`ALLOWED_HOSTS entry must be a bare exact hostname without scheme, port, path, or wildcard: ${host}`);
    }
    if (!isValidEmail(env.supportEmail)) errors.push('SUPPORT_EMAIL must be a valid email address when configured.');
    if (!isValidEmail(env.securityContactEmail)) errors.push('SECURITY_CONTACT_EMAIL must be a valid email address when configured.');
    if (!env.supportEmail) warnings.push('SUPPORT_EMAIL is not configured; public contact inquiries will remain visible in Superadmin but email forwarding is disabled.');
    if (!env.securityContactEmail) warnings.push('SECURITY_CONTACT_EMAIL is not configured; security.txt will point reporters to the public contact page.');
    if (env.privilegedMfaEnabled) {
      if (!env.emailDeliveryEnabled) errors.push('PRIVILEGED_MFA_ENABLED=true requires working SMTP/email delivery in production.');
      if (!isSecureSecret(env.privilegedMfaChallengeSecret)) errors.push('PRIVILEGED_MFA_CHALLENGE_SECRET must be a unique random value of at least 32 characters when privileged MFA is enabled.');
      if (env.privilegedMfaChallengeSecret && Object.values(secrets).includes(env.privilegedMfaChallengeSecret)) errors.push('PRIVILEGED_MFA_CHALLENGE_SECRET must be distinct from web/session/token-encryption secrets.');
    }
    if (!env.privilegedMfaEnabled) warnings.push('PRIVILEGED_MFA_ENABLED is disabled; enable it before granting production administrative access.');
    if (/localhost|127\.0\.0\.1/i.test(env.mongoUri)) errors.push('MONGO_URI must not point to localhost in production.');
    if (env.generatedMediaStorage === 'local') errors.push('GENERATED_MEDIA_STORAGE=local is not allowed in production because local disk is ephemeral. Use gridfs or cloudinary.');
    if (env.mcpEnabled) {
      if (!isPublicHttpsUrl(env.mcpOAuthIssuer)) errors.push('MCP_OAUTH_ISSUER must be a public HTTPS URL when MCP_ENABLED=true in production.');
      if (!isPublicHttpsUrl(env.mcpResourceUrl)) errors.push('MCP_RESOURCE_URL must be a public HTTPS URL when MCP_ENABLED=true in production.');
      if (!isSecureSecret(env.mcpOAuthTokenSecret)) errors.push('MCP_OAUTH_TOKEN_SECRET must be a unique random value of at least 32 characters when MCP_ENABLED=true.');
      if (env.mcpOAuthTokenSecret && Object.values(secrets).includes(env.mcpOAuthTokenSecret)) errors.push('MCP_OAUTH_TOKEN_SECRET must be distinct from web/session/token-encryption secrets.');
    }

    if (String(env.pesapalEnvironment || '').toLowerCase() !== 'production') errors.push('PESAPAL_ENVIRONMENT must be production when NODE_ENV=production.');
    if (!env.pesapalConsumerKey || !env.pesapalConsumerSecret) errors.push('PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET are required in production.');
    if (!env.pesapalIpnId && !env.pesapalAutoRegisterIpn) errors.push('Configure PESAPAL_IPN_ID or enable PESAPAL_AUTO_REGISTER_IPN=true before taking production payments.');
    if (env.pesapalBaseUrl && String(env.pesapalBaseUrl).replace(/\/+$/, '') !== 'https://pay.pesapal.com/v3') errors.push('PESAPAL_BASE_URL may not override the official live Pesapal API origin in production.');
    const billingUrls = {
      PESAPAL_CALLBACK_URL: env.pesapalCallbackUrl || `${String(env.appUrl).replace(/\/+$/, '')}/dashboard/billing/pesapal/callback`,
      PESAPAL_CANCELLATION_URL: env.pesapalCancellationUrl || `${String(env.appUrl).replace(/\/+$/, '')}/dashboard/billing?cancelled=1`,
      PESAPAL_IPN_URL: env.pesapalIpnUrl || `${String(env.appUrl).replace(/\/+$/, '')}/dashboard/billing/pesapal/ipn`
    };
    for (const [name, value] of Object.entries(billingUrls)) {
      if (!isPublicHttpsUrl(value)) errors.push(`${name} must be a public HTTPS URL in production.`);
      else if (!sameHostname(value, env.appUrl)) errors.push(`${name} must use the APP_URL hostname.`);
    }
    for (const [name, value] of Object.entries(secrets)) {
      if (!isSecureSecret(value)) errors.push(`${name} must be a unique random value of at least 32 characters.`);
    }
    if (new Set(Object.values(secrets)).size !== Object.values(secrets).length) errors.push('Security secrets must be distinct; do not reuse one secret for multiple purposes.');
    if (env.runAiGenerationWorkerInWeb) warnings.push('AI generation runs in the web process. This is correct for a single-service deployment; use AI_GENERATION_WORKER_MODE=external only when a dedicated aiworker is running.');
    const smtpValues = [env.smtpHost, env.smtpUser, env.smtpPass, env.emailFrom].filter(Boolean);
    if (smtpValues.length > 0 && smtpValues.length < 4) {
      const message = 'SMTP configuration is incomplete; set SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM together.';
      if (env.emailDeliveryMode === 'required') errors.push(message);
      else warnings.push(`${message} Email delivery will remain disabled.`);
    }
    if (env.emailDeliveryMode === 'required' && !env.smtpConfigured) {
      errors.push('EMAIL_DELIVERY_MODE=required needs SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM.');
    }
    if (env.emailVerificationRequired && !env.emailDeliveryEnabled) {
      errors.push('EMAIL_VERIFICATION_REQUIRED=true needs enabled and complete SMTP delivery.');
    }
    if (env.emailDeliveryMode === 'optional' && !env.smtpConfigured) {
      warnings.push('Email delivery is not configured. The app will start, new accounts will not require email verification, and password reset/team invite email delivery will be unavailable.');
    }
    if (env.emailDeliveryMode === 'disabled' && env.smtpConfigured) {
      warnings.push('SMTP credentials are configured but EMAIL_DELIVERY_MODE=disabled, so no email will be sent.');
    }
    if (env.allowDevelopmentEmailLinks) errors.push('ALLOW_DEVELOPMENT_EMAIL_LINKS must be false in production.');
    if (!env.redisConfigured) warnings.push('Redis is disabled. The MongoDB publishing fallback will be used; configure REDIS_URL for multi-instance queue acceleration.');
  }

  if (env.legacyScheduledPublishingDisabled && !env.publishingPaused) warnings.push('ENABLE_SCHEDULED_PUBLISHING=false is deprecated and ignored so scheduled posts are not stranded. Use PAUSE_PUBLISHING=true for an intentional pause.');
  if (env.legacyAiWorkerDisabledInWeb && env.aiGenerationWorkerMode === 'web') warnings.push('RUN_AI_GENERATION_WORKER_IN_WEB=false is deprecated and ignored. Set AI_GENERATION_WORKER_MODE=external only with a live dedicated aiworker.');
  if (env.publishingPaused) warnings.push('PAUSE_PUBLISHING=true: no scheduled or immediate posts will be published.');
  if (env.aiGenerationWorkerMode === 'off') warnings.push('AI_GENERATION_WORKER_MODE=off: AI-created posts will remain queued.');
  if (env.analyticsSyncWorkerMode === 'off') warnings.push('ANALYTICS_SYNC_WORKER_MODE=off: provider analytics and asynchronous publication status will not be synchronized.');
  if (env.paymentReconciliationWorkerMode === 'off') warnings.push('PAYMENT_RECONCILIATION_WORKER_MODE=off: missed Pesapal callback/IPN recovery and periodic reversal checks are disabled.');
  if (env.aiBrainWorkerMode === 'off') warnings.push('AI_BRAIN_WORKER_MODE=off: autonomous AI Brain background runs are disabled; manual/ChatGPT workflows still work.');
  if (env.tokenEncryptionKeySource === 'development_file') warnings.push(`TOKEN_ENCRYPTION_KEY was loaded from ${env.tokenEncryptionKeyFile}. Keep this file when replacing the project, or set TOKEN_ENCRYPTION_KEY explicitly.`);
  if (env.tokenEncryptionKeySource === 'ephemeral_fallback') warnings.push('TOKEN_ENCRYPTION_KEY is ephemeral because the development key file could not be created. Connected social accounts will require reconnection after restart.');
  if (env.redisEnabled && !env.redisConfigured) errors.push('REDIS_ENABLED=true requires REDIS_URL or REDIS_HOST.');
  if (!env.redisEnabled && cleanEnvForValidation(process.env.REDIS_HOST)) warnings.push('REDIS_HOST is set but Redis is disabled. Set REDIS_ENABLED=true only when a Redis server is actually running.');

  const cloudinaryValues = [env.cloudinaryCloudName, env.cloudinaryApiKey, env.cloudinaryApiSecret].filter(Boolean);
  if (cloudinaryValues.length > 0 && cloudinaryValues.length < 3) errors.push('Cloudinary configuration is incomplete; set cloud name, API key, and API secret together.');
  if (cloudinaryValues.length === 0 && ![env.publicAppUrl, env.appUrl].some(isPublicHttpsUrl)) {
    warnings.push('Instagram cannot fetch generated media from localhost. Configure Cloudinary or expose the app through a public HTTPS URL and set PUBLIC_APP_URL. Facebook Page publishing can still use direct file upload.');
  }

  if (errors.length) {
    const error = new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
    error.code = 'EINVALIDENV';
    error.validationErrors = errors;
    error.validationWarnings = warnings;
    throw error;
  }

  return { ok: true, warnings };
}

module.exports = { validateEnvironment, isSecureSecret };

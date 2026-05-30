const env = require('../config/env');
const ApiLog = require('../models/ApiLog');
const { checkOpenAI } = require('./aiContentService');
const { checkCloudinary } = require('./cloudinaryService');
const { canReachRedis } = require('./schedulerService');
const { facebookConnectionChecklist, isFacebookConfigured } = require('./facebookService');
const { isGoogleConfigured } = require('./googleAuthService');

async function timed(provider, action, user, fn) {
  const started = Date.now();
  const result = await fn();
  const durationMs = Date.now() - started;

  await ApiLog.create({
    user: user?._id,
    provider,
    action,
    status: result.ok ? 'success' : result.configured === false ? 'skipped' : 'failed',
    durationMs,
    message: result.message,
    metadata: result
  });

  return { provider, action, durationMs, ...result };
}

async function checkProviders(user) {
  const [openai, cloudinary, redis] = await Promise.all([
    timed('openai', 'health_check', user, checkOpenAI),
    timed('cloudinary', 'health_check', user, checkCloudinary),
    timed('redis', 'health_check', user, async () => {
      const ok = await canReachRedis();
      return {
        ok,
        configured: true,
        message: ok ? `Redis reachable at ${env.redisHost}:${env.redisPort}.` : `Redis not reachable at ${env.redisHost}:${env.redisPort}.`
      };
    })
  ]);

  const facebook = await timed('facebook', 'config_check', user, async () => {
    const setup = facebookConnectionChecklist();
    return {
      ok: setup.canStartOAuth,
      configured: isFacebookConfigured(),
      message: setup.canStartOAuth
        ? `Facebook OAuth ready. Redirect URI: ${setup.validOAuthRedirectUri}.`
        : `Facebook OAuth setup incomplete. ${setup.issues.join(' ')}`,
      ...setup
    };
  });

  const google = await timed('google', 'config_check', user, async () => ({
    ok: isGoogleConfigured(),
    configured: isGoogleConfigured(),
    message: isGoogleConfigured() ? 'Google OAuth keys configured.' : 'Google OAuth keys are missing.'
  }));

  return [openai, cloudinary, redis, google, facebook];
}

module.exports = { checkProviders };

const ApiLog = require('../models/ApiLog');
const env = require('../config/env');
const { facebookConnectionChecklist } = require('../services/facebookService');
const { checkProviders } = require('../services/providerHealthService');

function configRows() {
  return [
    { name: 'OpenAI', keys: ['OPENAI_API_KEY'], ready: Boolean(env.openaiApiKey) },
    { name: 'Google OAuth', keys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'], ready: Boolean(env.googleClientId && env.googleClientSecret && env.googleCallbackUrl) },
    { name: 'Cloudinary', keys: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'], ready: Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret) },
    { name: 'Redis', keys: ['REDIS_HOST', 'REDIS_PORT'], ready: Boolean(env.redisHost && env.redisPort) },
    {
      name: 'Meta / Facebook',
      keys: ['FACEBOOK_APP_ID or META_APP_ID', 'FACEBOOK_APP_SECRET or META_APP_SECRET', 'FACEBOOK_CALLBACK_URL or META_CALLBACK_URL', 'FACEBOOK_LOGIN_CONFIG_ID', 'FACEBOOK_APP_DOMAINS'],
      ready: facebookConnectionChecklist().canStartOAuth
    },
    {
      name: 'WhatsApp Cloud API',
      keys: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_DEFAULT_TO'],
      ready: Boolean(env.whatsappAccessToken && env.whatsappPhoneNumberId)
    }
  ];
}

async function index(req, res, next) {
  try {
    const logs = await ApiLog.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20);
    res.render('settings/index', {
      title: 'Settings',
      layout: 'layouts/dashboard',
      configs: configRows(),
      results: null,
      logs
    });
  } catch (error) {
    next(error);
  }
}

async function diagnostics(req, res, next) {
  try {
    const results = await checkProviders(req.user);
    const logs = await ApiLog.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20);
    res.render('settings/index', {
      title: 'Settings',
      layout: 'layouts/dashboard',
      configs: configRows(),
      results,
      logs
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { index, diagnostics };

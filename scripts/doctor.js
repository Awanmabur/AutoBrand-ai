const net = require('net');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const { checkOpenAI } = require('../src/services/aiContentService');
const { facebookConnectionChecklist } = require('../src/services/facebookService');

function checkPort(host, port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function main() {
  const checks = [];

  checks.push({
    name: 'APP_NAME',
    ok: Boolean(env.appName),
    detail: env.appName
  });

  checks.push({
    name: 'PORT',
    ok: Boolean(env.port),
    detail: String(env.port)
  });

  checks.push({
    name: 'JWT secrets',
    ok: !env.jwtAccessSecret.includes('change-this') && !env.jwtRefreshSecret.includes('change-this'),
    detail: env.jwtAccessSecret.includes('change-this') ? 'using development fallback' : 'configured'
  });

  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 2000 });
    checks.push({ name: 'MongoDB', ok: true, detail: env.mongoUri });
    await mongoose.disconnect();
  } catch (error) {
    checks.push({ name: 'MongoDB', ok: false, detail: error.message });
  }

  const redisOk = await checkPort(env.redisHost, env.redisPort);
  checks.push({
    name: 'Redis',
    ok: redisOk,
    detail: redisOk ? `${env.redisHost}:${env.redisPort}` : 'optional for dev, required for worker scheduling'
  });

  const openAiStatus = await checkOpenAI();
  checks.push({
    name: 'OpenAI',
    ok: openAiStatus.ok,
    detail: `${openAiStatus.message} Model: ${env.openaiModel}.`
  });

  checks.push({
    name: 'Cloudinary',
    ok: Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret),
    detail: env.cloudinaryCloudName ? 'partially/fully configured' : 'missing keys; URL media fallback will be used'
  });

  checks.push({
    name: 'Google',
    ok: Boolean(env.googleClientId && env.googleClientSecret && env.googleCallbackUrl),
    detail: env.googleClientId ? 'configured' : 'missing keys; Google login will show unavailable message'
  });

  const facebookSetup = facebookConnectionChecklist();

  checks.push({
    name: 'Facebook OAuth',
    ok: facebookSetup.canStartOAuth,
    detail: facebookSetup.canStartOAuth
      ? `ready; redirect URI ${facebookSetup.validOAuthRedirectUri}`
      : `${facebookSetup.issues.join(' ')} Redirect URI to add in Meta: ${facebookSetup.validOAuthRedirectUri || 'not set'}`
  });

  console.log('\nAutoBrand AI doctor\n');
  checks.forEach((check) => {
    console.log(`${check.ok ? 'OK ' : 'WARN'} ${check.name}: ${check.detail}`);
  });

  const requiredFailed = checks.filter((check) => ['MongoDB'].includes(check.name) && !check.ok);
  if (requiredFailed.length) {
    console.log('\nRequired checks failed. Fix them before starting the app.');
    process.exit(1);
  }

  console.log('\nStart the app with:');
  console.log('  npm.cmd start');
  console.log('\nOpen:');
  console.log(`  ${env.appUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

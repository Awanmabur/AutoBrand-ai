const crypto = require('crypto');
const env = require('../config/env');

const cookieName = 'csrfToken';
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function signToken(token) {
  return crypto.createHmac('sha256', env.csrfSecret).update(token).digest('hex');
}

function makeToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return `${token}.${signToken(token)}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isValidToken(signedToken) {
  if (!signedToken || !signedToken.includes('.')) return false;
  const index = signedToken.lastIndexOf('.');
  const token = signedToken.slice(0, index);
  const signature = signedToken.slice(index + 1);
  return Boolean(token && signature && safeEqual(signature, signToken(token)));
}

function isWebhookExempt(req) {
  return /^\/dashboard\/actions\/webhooks\/[^/]+$/.test(req.path)
    || req.path === '/dashboard/billing/pesapal/ipn';
}

function urlOrigin(value) {
  try {
    return new URL(String(value || '')).origin.toLowerCase();
  } catch (_error) {
    return '';
  }
}

function requestOrigin(req) {
  const host = String(req.get('host') || '').trim();
  if (!host || /[\/\s]/.test(host)) return '';
  return urlOrigin(`${req.protocol}://${host}`);
}

function allowedOrigins(req) {
  return new Set([
    urlOrigin(env.appUrl),
    urlOrigin(env.publicAppUrl),
    requestOrigin(req)
  ].filter(Boolean));
}

function sameOrigin(req) {
  const site = String(req.get('sec-fetch-site') || '').toLowerCase();
  if (site === 'cross-site') return false;

  const source = req.get('origin') || req.get('referer');
  if (!source) return true;

  const sourceOrigin = urlOrigin(source);
  return Boolean(sourceOrigin && allowedOrigins(req).has(sourceOrigin));
}

function csrfProtection(req, res, next) {
  if (isWebhookExempt(req)) return next();

  let signedToken = req.cookies[cookieName];
  if (!isValidToken(signedToken)) {
    signedToken = makeToken();
    res.cookie(cookieName, signedToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
      path: '/',
      priority: 'high'
    });
  }

  req.csrfToken = () => signedToken;
  if (safeMethods.has(req.method)) return next();

  if (!sameOrigin(req)) {
    const error = new Error('Cross-site request rejected.');
    error.status = 403;
    error.code = 'EBADCSRFTOKEN';
    return next(error);
  }

  const submittedToken = req.body?._csrf || req.get('x-csrf-token');
  if (!safeEqual(submittedToken, signedToken)) {
    const error = new Error('Invalid CSRF token.');
    error.status = 403;
    error.code = 'EBADCSRFTOKEN';
    return next(error);
  }

  return next();
}

module.exports = csrfProtection;

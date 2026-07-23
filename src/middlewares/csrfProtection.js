const crypto = require('crypto');
const env = require('../config/env');

const legacyCookieName = 'csrfToken';
const cookieName = env.nodeEnv === 'production' ? '__Host-autobrand-csrf' : 'autobrandCsrf';
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

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    path: '/',
    priority: 'high'
  };
}

function setTokenCookie(res, token) {
  res.cookie(cookieName, token, cookieOptions());

  // Remove the pre-v8 cookie. A legacy domain/host cookie with the same name
  // can otherwise be sent alongside a newly issued value and cause permanent
  // double-submit mismatches after a deployment or secret rotation.
  if (cookieName !== legacyCookieName) {
    res.clearCookie(legacyCookieName, cookieOptions());
  }
}

function csrfError(message, reason) {
  const error = new Error(message);
  error.status = 403;
  error.code = 'EBADCSRFTOKEN';
  error.csrfReason = reason;
  return error;
}

function csrfProtection(req, res, next) {
  if (isWebhookExempt(req)) return next();

  const currentCookie = req.cookies?.[cookieName];
  const legacyCookie = req.cookies?.[legacyCookieName];
  let signedToken = isValidToken(currentCookie)
    ? currentCookie
    : (isValidToken(legacyCookie) ? legacyCookie : '');

  if (safeMethods.has(req.method)) {
    if (!signedToken) signedToken = makeToken();
    setTokenCookie(res, signedToken);
    req.csrfToken = () => signedToken;
    return next();
  }

  if (!sameOrigin(req)) {
    req.csrfToken = () => signedToken || makeToken();
    return next(csrfError('Cross-site request rejected.', 'origin'));
  }

  const submittedToken = req.body?._csrf || req.get('x-csrf-token');
  if (!isValidToken(submittedToken)) {
    const replacement = signedToken || makeToken();
    setTokenCookie(res, replacement);
    req.csrfToken = () => replacement;
    return next(csrfError('Your security session expired. Refresh the page and try again.', 'missing_or_invalid_form_token'));
  }

  // The submitted token is signed by this application and the request is
  // same-origin. If the browser omitted a cookie, retained a legacy duplicate,
  // or sent a stale cookie after deployment, recover by rotating the cookie to
  // the valid form/header token instead of trapping the user in a 419 loop.
  if (!signedToken || !safeEqual(submittedToken, signedToken)) {
    signedToken = submittedToken;
    setTokenCookie(res, signedToken);
  }

  req.csrfToken = () => signedToken;
  return next();
}

csrfProtection.cookieName = cookieName;
csrfProtection.legacyCookieName = legacyCookieName;
csrfProtection.isValidToken = isValidToken;

module.exports = csrfProtection;

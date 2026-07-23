const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'production';
process.env.CSRF_SECRET = 'csrf-test-secret-that-is-at-least-thirty-two-characters';
process.env.COOKIE_SECRET = 'cookie-test-secret-that-is-at-least-thirty-two-characters';
process.env.JWT_ACCESS_SECRET = 'jwt-access-test-secret-that-is-at-least-thirty-two-characters';
process.env.JWT_REFRESH_SECRET = 'jwt-refresh-test-secret-that-is-at-least-thirty-two-characters';
process.env.WEBHOOK_SECRET = 'webhook-test-secret-that-is-at-least-thirty-two-characters';
process.env.TOKEN_ENCRYPTION_KEY = 'token-encryption-test-key-that-is-at-least-thirty-two-characters';
process.env.APP_URL = 'https://autobrand-ai.onrender.com';
process.env.PUBLIC_APP_URL = 'https://autobrand-ai.onrender.com';

const csrfProtection = require('../src/middlewares/csrfProtection');

function responseMock() {
  const cookies = [];
  const cleared = [];
  return {
    cookies,
    cleared,
    cookie(name, value, options) { cookies.push({ name, value, options }); },
    clearCookie(name, options) { cleared.push({ name, options }); }
  };
}

function requestMock({ method = 'GET', cookies = {}, body = {}, origin = 'https://autobrand-ai.onrender.com', referer = '', site = 'same-origin' } = {}) {
  const headers = {
    host: 'autobrand-ai.onrender.com',
    origin,
    referer,
    'sec-fetch-site': site
  };
  return {
    method,
    path: '/auth/login',
    protocol: 'https',
    cookies,
    body,
    get(name) { return headers[String(name).toLowerCase()] || ''; }
  };
}

function run(req, res) {
  return new Promise((resolve) => {
    csrfProtection(req, res, (error) => resolve(error || null));
  });
}

test('safe request issues a production-safe CSRF cookie and token', async () => {
  const req = requestMock();
  const res = responseMock();
  const error = await run(req, res);
  assert.equal(error, null);
  assert.equal(typeof req.csrfToken, 'function');
  assert.equal(csrfProtection.isValidToken(req.csrfToken()), true);
  assert.equal(res.cookies.length, 1);
  assert.equal(res.cookies[0].name, '__Host-autobrand-csrf');
  assert.equal(res.cookies[0].name, csrfProtection.cookieName);
  assert.equal(res.cookies[0].options.httpOnly, true);
  assert.equal(res.cookies[0].options.sameSite, 'lax');
});

test('same-origin POST recovers when browser omitted the CSRF cookie', async () => {
  const getReq = requestMock();
  const getRes = responseMock();
  await run(getReq, getRes);
  const token = getReq.csrfToken();

  const postReq = requestMock({ method: 'POST', body: { _csrf: token }, cookies: {} });
  const postRes = responseMock();
  const error = await run(postReq, postRes);

  assert.equal(error, null);
  assert.equal(postReq.csrfToken(), token);
  assert.equal(postRes.cookies.at(-1).value, token);
});

test('same-origin POST recovers from stale duplicate cookie mismatch', async () => {
  const firstReq = requestMock();
  const firstRes = responseMock();
  await run(firstReq, firstRes);
  const stale = firstReq.csrfToken();

  const secondReq = requestMock();
  const secondRes = responseMock();
  await run(secondReq, secondRes);
  const submitted = secondReq.csrfToken();

  const postReq = requestMock({
    method: 'POST',
    cookies: { [csrfProtection.cookieName]: stale },
    body: { _csrf: submitted }
  });
  const postRes = responseMock();
  const error = await run(postReq, postRes);

  assert.equal(error, null);
  assert.equal(postReq.csrfToken(), submitted);
  assert.equal(postRes.cookies.at(-1).value, submitted);
});

test('invalid unsigned form token is rejected with a recoverable 419 reason', async () => {
  const req = requestMock({ method: 'POST', body: { _csrf: 'invalid' } });
  const res = responseMock();
  const error = await run(req, res);
  assert.equal(error.code, 'EBADCSRFTOKEN');
  assert.equal(error.csrfReason, 'missing_or_invalid_form_token');
  assert.equal(res.cookies.length, 1);
});

test('cross-site request is rejected even with a signed token', async () => {
  const getReq = requestMock();
  const getRes = responseMock();
  await run(getReq, getRes);
  const token = getReq.csrfToken();

  const req = requestMock({
    method: 'POST',
    cookies: { [csrfProtection.cookieName]: token },
    body: { _csrf: token },
    origin: 'https://attacker.example',
    site: 'cross-site'
  });
  const res = responseMock();
  const error = await run(req, res);
  assert.equal(error.code, 'EBADCSRFTOKEN');
  assert.equal(error.csrfReason, 'origin');
});

test('all shared layouts define a defensive application name', () => {
  const fs = require('node:fs');
  for (const file of ['main.ejs', 'auth.ejs', 'embed.ejs', 'dashboard.ejs']) {
    const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'src', 'views', 'layouts', file), 'utf8');
    assert.match(source, /resolvedAppName/);
    assert.match(source, /AutoBrand AI/);
  }
});

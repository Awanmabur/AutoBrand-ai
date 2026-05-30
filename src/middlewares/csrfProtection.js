const crypto = require('crypto');
const env = require('../config/env');

const cookieName = 'csrfToken';
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function signToken(token) {
  return crypto.createHmac('sha256', env.csrfSecret).update(token).digest('hex');
}

function makeToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return `${token}.${signToken(token)}`;
}

function isValidToken(signedToken) {
  if (!signedToken || !signedToken.includes('.')) return false;
  const [token, signature] = signedToken.split('.');
  const expected = signToken(token);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function csrfProtection(req, res, next) {
  if (req.path.startsWith('/api/') || req.path.includes('/webhook')) {
    return next();
  }

  let signedToken = req.cookies[cookieName];

  if (!isValidToken(signedToken)) {
    signedToken = makeToken();
    res.cookie(cookieName, signedToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
  }

  req.csrfToken = () => signedToken;

  if (safeMethods.has(req.method)) {
    return next();
  }

  const submittedToken = req.body._csrf || req.get('x-csrf-token');

  if (submittedToken !== signedToken) {
    const error = new Error('Invalid CSRF token.');
    error.status = 403;
    error.code = 'EBADCSRFTOKEN';
    return next(error);
  }

  return next();
}

module.exports = csrfProtection;

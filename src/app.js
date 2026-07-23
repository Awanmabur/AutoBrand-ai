const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const mongoose = require('mongoose');
const crypto = require('crypto');
const requestSanitizer = require('./middlewares/requestSanitizer');
const { createRateLimiter } = require('./config/rateLimit');
const { streamGridFsMedia } = require('./services/gridFsMediaStorage.service');

const env = require('./config/env');
const attachUser = require('./middlewares/attachUser');
const csrfProtection = require('./middlewares/csrfProtection');
const errorHandler = require('./middlewares/errorHandler');
const notFound = require('./middlewares/notFound');
const databaseAvailability = require('./middlewares/databaseAvailability');

const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const brandRoutes = require('./routes/brands');
const aiRoutes = require('./routes/ai');
const videoRoutes = require('./routes/videos');
const mediaRoutes = require('./routes/media');
const templateRoutes = require('./routes/templates');
const postRoutes = require('./routes/posts');
const campaignRoutes = require('./routes/campaigns');
const growthStudioRoutes = require('./routes/growthStudio');
const socialRoutes = require('./routes/social');
const teamRoutes = require('./routes/team');
const approvalRoutes = require('./routes/approvals');
const notificationRoutes = require('./routes/notifications');
const billingRoutes = require('./routes/billing');
const avatarRoutes = require('./routes/avatars');
const settingsRoutes = require('./routes/settings');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhooks');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.nodeEnv === 'production' ? env.trustProxyHops : false);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

app.use(expressLayouts);
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('hex');
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      connectSrc: ["'self'", 'https:'],
      frameSrc: ["'self'", 'https:'],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      ...(env.nodeEnv === 'production' ? { upgradeInsecureRequests: [] } : {})
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  strictTransportSecurity: env.nodeEnv === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false
}));
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self), usb=()');
  next();
});
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  dotfiles: 'deny',
  etag: true,
  fallthrough: true,
  // Asset filenames are not content-hashed, so immutable caching can keep a
  // broken dashboard script after deployment. Revalidate instead.
  immutable: false,
  maxAge: env.nodeEnv === 'production' ? '1h' : 0
}));
app.use((req, res, next) => {
  const supplied = String(req.headers['x-request-id'] || '');
  req.id = /^[A-Za-z0-9_-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
});

// Baseline view locals must exist before database, authentication, CSRF, and
// other middleware can fail. Error rendering must never depend on a later
// middleware having completed.
app.use((req, res, next) => {
  res.locals.appName = env.appName || 'AutoBrand AI';
  res.locals.currentPath = req.path || '/';
  res.locals.user = null;
  res.locals.csrfToken = '';
  next();
});

function health(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, app: env.appName, timestamp: new Date().toISOString(), requestId: req.id });
}

app.get('/health', health);
app.get('/healthz', health);
app.get('/readyz', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.set('Cache-Control', 'no-store');
  return res.status(ready ? 200 : 503).json({ ok: ready, mongoState: mongoose.connection.readyState, redisEnabled: env.redisEnabled, requestId: req.id });
});

// Fail fast while MongoDB is reconnecting instead of letting media,
// authentication, dashboard, API, or publishing requests wait for timeouts.
app.use(databaseAvailability);
// Generated media persisted in MongoDB/GridFS. This route is public so Meta can
// fetch it from the configured HTTPS APP_URL, and supports byte ranges for video.
app.get('/uploads/db/:id/:filename?', streamGridFsMedia);
app.head('/uploads/db/:id/:filename?', streamGridFsMedia);
app.use(express.urlencoded({ extended: false, limit: '2mb', parameterLimit: 1000 }));
app.use(express.json({
  limit: '2mb',
  strict: true,
  verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); }
}));
app.use(requestSanitizer);
app.use(cookieParser(env.cookieSecret));
app.use(methodOverride('_method'));
app.use(createRateLimiter({
  prefix: 'global',
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitMax
}));

app.use(attachUser);
app.use(csrfProtection);

app.use((req, res, next) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/dashboard')) {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

app.use((req, res, next) => {
  res.locals.appName = env.appName || res.locals.appName || 'AutoBrand AI';
  res.locals.currentPath = req.path || res.locals.currentPath || '/';
  res.locals.user = req.user || null;
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
  next();
});

app.use('/', publicRoutes);
app.use('/auth', authRoutes);

// Public callbacks that must not require an authenticated browser session.
app.use('/dashboard/billing', billingRoutes);

// Authenticated feature mutations and integration callbacks live under the dashboard namespace.
// Do not expose duplicate root feature routes such as /posts, /media, /billing, or /admin.
app.use('/dashboard/actions/brands', brandRoutes);
app.use('/dashboard/actions/ai', aiRoutes);
app.use('/dashboard/actions/videos', videoRoutes);
app.use('/dashboard/actions/media', mediaRoutes);
app.use('/dashboard/actions/templates', templateRoutes);
app.use('/dashboard/actions/posts', postRoutes);
app.use('/dashboard/actions/campaigns', campaignRoutes);
app.use('/dashboard/actions/growth-studio', growthStudioRoutes);
app.use('/dashboard/actions/social', socialRoutes);
app.use('/dashboard/actions/team', teamRoutes);
app.use('/dashboard/actions/approvals', approvalRoutes);
app.use('/dashboard/actions/notifications', notificationRoutes);
app.use('/dashboard/actions/avatars', avatarRoutes);
app.use('/dashboard/actions/settings', settingsRoutes);
app.use('/dashboard/actions/admin', adminRoutes);
app.use('/dashboard/actions/webhooks', webhookRoutes);

app.use('/dashboard', dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

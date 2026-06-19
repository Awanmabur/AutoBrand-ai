const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const env = require('./config/env');
const attachUser = require('./middlewares/attachUser');
const csrfProtection = require('./middlewares/csrfProtection');
const errorHandler = require('./middlewares/errorHandler');
const notFound = require('./middlewares/notFound');

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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

app.use(expressLayouts);
app.use(helmet({
  contentSecurityPolicy: env.nodeEnv === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:'],
      frameAncestors: ["'self'"]
    }
  } : false
}));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
});
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser(env.cookieSecret));
app.use(methodOverride('_method'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.use(attachUser);
app.use(csrfProtection);

app.use((req, res, next) => {
  res.locals.appName = env.appName;
  res.locals.currentPath = req.path;
  res.locals.user = req.user;
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
  next();
});

function health(req, res) {
  res.json({ ok: true, app: env.appName, env: env.nodeEnv, timestamp: new Date().toISOString(), requestId: req.id });
}

app.get('/health', health);
app.get('/healthz', health);

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

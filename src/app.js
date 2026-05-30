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
const calendarRoutes = require('./routes/calendar');
const campaignRoutes = require('./routes/campaigns');
const growthStudioRoutes = require('./routes/growthStudio');
const socialRoutes = require('./routes/social');
const teamRoutes = require('./routes/team');
const approvalRoutes = require('./routes/approvals');
const notificationRoutes = require('./routes/notifications');
const billingRoutes = require('./routes/billing');
const analyticsRoutes = require('./routes/analytics');
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

function redirectToDashboardFeature(page) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login');
    return res.redirect(303, `/dashboard/${page}`);
  };
}

function redirectComposerToDashboard(req, res, next) {
  if (req.query.embedded || req.get('X-Requested-With') === 'XMLHttpRequest') return next();
  if (!req.user) return res.redirect('/auth/login');
  return res.redirect(303, '/dashboard/quick-create');
}

app.get('/brands', redirectToDashboardFeature('brand-brain'));
app.get('/ai', redirectToDashboardFeature('quick-create'));
app.get('/videos', redirectToDashboardFeature('video-system'));
app.get('/media', redirectToDashboardFeature('media'));
app.get('/templates', redirectToDashboardFeature('video-system'));
app.get('/posts', redirectToDashboardFeature('content-library'));
app.get('/posts/drafts', redirectToDashboardFeature('content-library'));
app.get('/posts/handoff', redirectToDashboardFeature('approvals'));
app.get('/posts/new', redirectComposerToDashboard);
app.get('/calendar', redirectToDashboardFeature('calendar'));
app.get('/campaigns', redirectToDashboardFeature('campaigns'));
app.get('/growth-studio', redirectToDashboardFeature('campaigns'));
app.get('/social', redirectToDashboardFeature('social'));
app.get('/approvals', redirectToDashboardFeature('approvals'));
app.get('/team', redirectToDashboardFeature('team'));
app.get('/roles', redirectToDashboardFeature('team'));
app.get('/users', redirectToDashboardFeature('team'));
app.get('/integrations', redirectToDashboardFeature('social'));
app.get('/security', redirectToDashboardFeature('settings'));
app.get('/whatsapp', redirectToDashboardFeature('social'));
app.get('/notifications', redirectToDashboardFeature('notifications'));
app.get('/billing', redirectToDashboardFeature('billing'));
app.get('/analytics', redirectToDashboardFeature('analytics'));
app.get('/avatars', redirectToDashboardFeature('avatar-video'));
app.get('/settings', redirectToDashboardFeature('settings'));
app.get('/admin', redirectToDashboardFeature('admin'));
app.get(/^\/admin\/plans(.*)/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  if (!req.user) return res.redirect('/auth/login');
  const suffix = String(req.params[0] || '').replace(/^\/+/, '');
  if (!suffix) return res.redirect(303, '/dashboard/plans');
  if (suffix === 'new') return res.redirect(303, '/dashboard/plans?mode=create');
  if (suffix.endsWith('/edit')) {
    const id = suffix.replace(/\/edit$/, '');
    return res.redirect(303, `/dashboard/plans?mode=edit&id=${encodeURIComponent(id)}`);
  }
  return res.redirect(303, `/dashboard/plans?view=${encodeURIComponent(suffix)}`);
});

app.use('/', publicRoutes);
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/brands', brandRoutes);
app.use('/ai', aiRoutes);
app.use('/videos', videoRoutes);
app.use('/media', mediaRoutes);
app.use('/templates', templateRoutes);
app.use('/posts', postRoutes);
app.use('/calendar', calendarRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/growth-studio', growthStudioRoutes);
app.use('/social', socialRoutes);
app.use('/team', teamRoutes);
app.use('/approvals', approvalRoutes);
app.use('/notifications', notificationRoutes);
app.use('/billing', billingRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/avatars', avatarRoutes);
app.use('/settings', settingsRoutes);
app.use('/admin', adminRoutes);
app.use('/webhooks', webhookRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

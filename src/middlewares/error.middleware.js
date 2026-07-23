const { buildErrorViewModel, defaultMessage, wantsJson } = require('../utils/errorResponse');
const { buildFeatureAccess } = require('../services/subscription/featureAccess.service');

const REMOVED_ROOT_ROUTES = {
  brands: '/dashboard/brand-brain',
  ai: '/dashboard/quick-create',
  videos: '/dashboard/video-system',
  templates: '/dashboard/video-system',
  media: '/dashboard/media',
  posts: '/dashboard/content-library',
  'content-library': '/dashboard/content-library',
  calendar: '/dashboard/calendar',
  campaigns: '/dashboard/campaigns',
  'growth-studio': '/dashboard/campaigns',
  social: '/dashboard/social',
  integrations: '/dashboard/social',
  team: '/dashboard/team',
  roles: '/dashboard/team',
  users: '/dashboard/team',
  approvals: '/dashboard/approvals',
  analytics: '/dashboard/analytics',
  notifications: '/dashboard/notifications',
  billing: '/dashboard/billing',
  avatars: '/dashboard/avatar-video',
  settings: '/dashboard/settings',
  security: '/dashboard/settings',
  admin: '/dashboard/admin'
};

function statusFromError(error) {
  if (error?.code === 'EBADCSRFTOKEN') return 419;
  if (error?.statusCode) return Number(error.statusCode);
  if (error?.status) return Number(error.status);
  return 500;
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function initials(name = '') {
  const parts = String(name || 'User')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return `${parts[0]?.[0] || 'U'}${parts[1]?.[0] || parts[0]?.[1] || ''}`.toUpperCase();
}

function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function safeCsrfToken(req, res) {
  if (res.locals.csrfToken) return res.locals.csrfToken;
  try {
    return req.csrfToken ? req.csrfToken() : '';
  } catch (error) {
    return '';
  }
}

function isDashboardRequest(req) {
  return String(req.originalUrl || req.path || '').startsWith('/dashboard');
}

function buildMinimalDashboardErrorData({ req, res, model, status }) {
  const user = req.user || {};
  const userName = user.name || user.email || 'User';
  let featureAccess;
  try {
    featureAccess = buildFeatureAccess({ user });
  } catch (error) {
    featureAccess = {
      role: user.role || 'brand_owner',
      planName: titleCase(user.plan || 'Free Trial'),
      planSlug: user.plan || 'free-trial',
      roleAllowedPages: ['overview', 'settings', 'notifications', 'billing', 'errors'],
      unlockedPages: ['overview', 'settings', 'notifications', 'billing', 'errors'],
      lockedPages: [],
      visiblePages: ['overview', 'settings', 'notifications', 'billing', 'errors'],
      pageLocks: {},
      capabilities: {}
    };
  }

  const unlockedPages = [...new Set([...(featureAccess.unlockedPages || []), 'errors'])];
  const visiblePages = [...new Set([...(featureAccess.visiblePages || featureAccess.roleAllowedPages || unlockedPages), 'errors'])];
  const errorCard = {
    kind: 'error',
    title: model.errorTitle,
    description: model.errorMessage || defaultMessage(status),
    tag: `Error ${status}`,
    status: `Error ${status}`,
    href: model.primaryActionHref,
    actionHref: model.secondaryActionHref,
    actionLabel: model.secondaryActionLabel,
    details: {
      Status: status,
      'Request ID': model.requestId,
      Timestamp: model.timestamp,
      Message: model.errorMessage || defaultMessage(status)
    }
  };

  return {
    generatedAt: new Date().toISOString(),
    isErrorPage: true,
    initialPage: 'errors',
    timeZone: process.env.APP_TIME_ZONE || process.env.TIME_ZONE || process.env.TZ || 'Africa/Kampala',
    csrfToken: safeCsrfToken(req, res),
    options: {
      brands: [],
      posts: [],
      campaigns: [],
      brandRecords: [],
      socialAccounts: [],
      media: [],
      teamMembers: [],
      avatarProfiles: [],
      adminPlans: [],
      publicPricingPlans: [],
      planSubscriptionCounts: {},
      calendar: { days: [], posts: [], weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }
    },
    user: {
      name: userName,
      firstName: userName.split(/\s+/)[0],
      initials: initials(userName),
      email: user.email || '',
      pendingEmail: user.pendingEmail || '',
      avatar: user.avatar || '',
      isVerified: Boolean(user.isVerified),
      status: user.status || 'active',
      accountDeletionStatus: user.accountDeletionStatus || 'none',
      accountDeletionRequestedAt: user.accountDeletionRequestedAt || '',
      role: titleCase(user.role || 'brand_owner'),
      plan: featureAccess.planName || titleCase(user.plan || 'Free Trial'),
      planSlug: featureAccess.planSlug || user.plan || 'free-trial'
    },
    workspace: {
      name: 'Dashboard',
      subtitle: `Error ${status} - request ${model.requestId || 'n/a'}`,
      primaryBrandName: 'Dashboard'
    },
    currentPlan: null,
    usageDashboard: null,
    featureAccess,
    roleAccess: {
      ...(featureAccess.capabilities || {}),
      allowedPages: unlockedPages,
      unlockedPages,
      lockedPages: featureAccess.lockedPages || [],
      visiblePages,
      pageLocks: featureAccess.pageLocks || {},
      planSlug: featureAccess.planSlug || user.plan || 'free-trial',
      planName: featureAccess.planName || titleCase(user.plan || 'Free Trial')
    },
    nav: {
      brands: 0,
      content: 0,
      campaigns: 0,
      drafts: 0,
      templates: 0,
      images: 0,
      videos: 0,
      scheduled: 0,
      handoff: 0,
      social: 0,
      approvals: 0,
      team: 0,
      users: 0,
      avatars: 0,
      plan: featureAccess.planName || titleCase(user.plan || 'Free Trial'),
      unread: 0
    },
    pages: {
      errors: {
        title: model.errorTitle || `Error ${status}`,
        kicker: `Error ${status}`,
        heading: model.errorTitle || 'Something went wrong',
        description: model.errorMessage || defaultMessage(status),
        stats: [
          [String(status), 'Error code', 'Dashboard state'],
          [model.requestId || 'n/a', 'Request ID', 'Support trace'],
          [new Date(model.timestamp).toLocaleString(), 'Captured', 'Local time'],
          ['Hidden', 'Navigation', 'Only shown on errors']
        ],
        cards: [errorCard],
        rows: [[model.errorTitle || `Error ${status}`, model.errorMessage || defaultMessage(status), `Error ${status}`]],
        tableRows: [[model.errorTitle || `Error ${status}`, model.requestId || 'n/a', `Error ${status}`]],
        form: false,
        error: model
      }
    }
  };
}

function renderDashboardExperienceError(error, req, res, model, status) {
  const dashboardData = buildMinimalDashboardErrorData({ req, res, model, status });
  return res.status(status).render('dashboard/experience', {
    title: model.errorTitle || `Error ${status}`,
    layout: false,
    csrfToken: dashboardData.csrfToken,
    dashboardData,
    dashboardJson: scriptJson(dashboardData)
  });
}

function renderError(error, req, res) {
  const status = statusFromError(error);
  const safeStatus = [400, 401, 403, 404, 419, 429, 500, 503].includes(status) ? status : 500;
  const model = buildErrorViewModel({ error, status: safeStatus, req });

  if (wantsJson(req)) {
    return res.status(safeStatus).json({
      error: model.errorTitle,
      message: model.errorMessage || defaultMessage(safeStatus),
      status: safeStatus,
      requestId: model.requestId
    });
  }

  if (req.user || isDashboardRequest(req) || removedRootRouteTarget(req.path)) {
    return renderDashboardExperienceError(error, req, res, model, safeStatus);
  }

  const layout = req.user ? 'layouts/dashboard' : 'layouts/main';
  return res.status(safeStatus).render('dashboard/pages/error', {
    ...model,
    layout,
    appName: res.locals.appName || 'AutoBrand AI',
    currentPath: res.locals.currentPath || req.path || '/',
    user: req.user || res.locals.user || null,
    csrfToken: safeCsrfToken(req, res),
    statusCode: safeStatus,
    title: model.errorTitle || `Error ${safeStatus}`
  });
}

function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = statusFromError(error);
  if (error?.code === 'EBADCSRFTOKEN') {
    console.warn('[security] CSRF request rejected', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.path,
      reason: error.csrfReason || 'unknown',
      origin: req.get('origin') || '',
      refererOrigin: (() => { try { return new URL(req.get('referer') || '').origin; } catch (_error) { return ''; } })()
    });
  } else if (status >= 500) {
    console.error(error);
  }
  return renderError(error, req, res);
}

function removedRootRouteTarget(path = '') {
  const firstSegment = String(path).replace(/^\/+/, '').split('/')[0];
  return REMOVED_ROOT_ROUTES[firstSegment] || '';
}

function notFoundMiddleware(req, res, next) {
  const target = removedRootRouteTarget(req.path);
  if (target && ['GET', 'HEAD'].includes(req.method) && !wantsJson(req)) {
    return res.redirect(303, target);
  }
  const error = new Error(target
    ? `This standalone route has been removed. Use the dashboard route ${target} instead.`
    : 'The page or resource you requested does not exist.');
  error.status = 404;
  error.expose = true;
  if (target) {
    error.title = 'Dashboard route required';
    error.primaryActionHref = target;
    error.primaryActionLabel = 'Open dashboard page';
    error.secondaryActionHref = '/dashboard/overview';
    error.secondaryActionLabel = 'Dashboard overview';
  }
  return next(error);
}

module.exports = { errorMiddleware, notFoundMiddleware, renderError, removedRootRouteTarget };

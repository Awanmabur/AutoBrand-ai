const { buildErrorViewModel, defaultMessage, wantsJson } = require('../utils/errorResponse');

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

  const layout = req.user ? 'layouts/dashboard' : 'layouts/main';
  return res.status(safeStatus).render('dashboard/pages/error', {
    ...model,
    layout,
    statusCode: safeStatus,
    title: model.errorTitle || `Error ${safeStatus}`
  });
}

function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = statusFromError(error);
  if (status >= 500) console.error(error);
  return renderError(error, req, res);
}

function removedRootRouteTarget(path = '') {
  const firstSegment = String(path).replace(/^\/+/, '').split('/')[0];
  return REMOVED_ROOT_ROUTES[firstSegment] || '';
}

function notFoundMiddleware(req, res, next) {
  const target = removedRootRouteTarget(req.path);
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

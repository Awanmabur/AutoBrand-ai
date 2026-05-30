const { buildErrorViewModel, defaultMessage, wantsJson } = require('../utils/errorResponse');

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

  const isDashboard = Boolean(req.user) || req.originalUrl?.startsWith('/dashboard') || req.originalUrl?.startsWith('/admin');
  const view = isDashboard ? `dashboard/pages/errors/${safeStatus}` : `errors/${safeStatus}`;
  const layout = isDashboard ? 'layouts/dashboard' : 'layouts/main';
  return res.status(safeStatus).render(view, { ...model, layout });
}

function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = statusFromError(error);
  if (status >= 500) console.error(error);
  return renderError(error, req, res);
}

function notFoundMiddleware(req, res, next) {
  const error = new Error('The page or resource you requested does not exist.');
  error.status = 404;
  error.expose = true;
  return next(error);
}

module.exports = { errorMiddleware, notFoundMiddleware, renderError };

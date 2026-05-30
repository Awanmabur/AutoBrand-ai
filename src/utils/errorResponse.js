function safeErrorMessage(error, status, nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv !== 'production') return error?.message || defaultMessage(status);
  if (error?.expose || status < 500) return error.message || defaultMessage(status);
  return defaultMessage(status);
}

function defaultTitle(status) {
  return {
    400: 'Bad request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Page not found',
    419: 'Session expired',
    429: 'Too many requests',
    500: 'Server error',
    503: 'Service unavailable'
  }[status] || 'Something went wrong';
}

function defaultMessage(status) {
  return {
    400: 'The request could not be processed. Please check your input and try again.',
    401: 'Please sign in to continue.',
    403: 'You do not have permission to access this resource.',
    404: 'The page or resource you requested does not exist.',
    419: 'Your security session expired. Refresh the page and try again.',
    429: 'Too many requests were sent in a short time. Please slow down and try again.',
    500: 'Something went wrong. Please try again or contact support.',
    503: 'This service is temporarily unavailable. Please try again later.'
  }[status] || 'Something went wrong. Please try again.';
}

function wantsJson(req) {
  return req.xhr || req.originalUrl?.startsWith('/api/') || req.get('accept')?.includes('application/json');
}

function buildErrorViewModel({ error, status, req }) {
  const requestId = req.id || req.headers['x-request-id'] || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const title = error?.title || defaultTitle(status);
  return {
    title,
    errorCode: status,
    errorTitle: title,
    errorMessage: safeErrorMessage(error, status),
    requestId,
    timestamp: new Date().toISOString(),
    primaryActionHref: req.user ? '/dashboard/overview' : '/',
    primaryActionLabel: req.user ? 'Back to dashboard' : 'Back home',
    secondaryActionHref: req.user ? '/settings' : '/auth/login',
    secondaryActionLabel: req.user ? 'Open settings' : 'Sign in',
    supportHref: 'mailto:support@example.com',
    details: process.env.NODE_ENV === 'production' ? undefined : error?.stack
  };
}

module.exports = { buildErrorViewModel, defaultMessage, defaultTitle, safeErrorMessage, wantsJson };

const morgan = require('morgan');

function safePath(req) {
  let pathname = '/';
  try { pathname = new URL(req.originalUrl || req.url || '/', 'http://autobrand.local').pathname; } catch (_error) { pathname = req.path || '/'; }
  pathname = pathname
    .replace(/^\/review\/[^/]+/, '/review/[redacted]')
    .replace(/^\/uploads\/drive\/([^/]+)\/[^/]+/, '/uploads/drive/$1/[redacted]')
    .replace(/^\/mcp\/oauth\/authorize\/[^/]+/, '/mcp/oauth/authorize/[redacted]');
  return pathname.slice(0, 1000);
}

morgan.token('safe-url', safePath);

function safeRequestLogger(nodeEnv = 'development') {
  if (nodeEnv === 'test') return (_req, _res, next) => next();
  const format = nodeEnv === 'production'
    ? ':remote-addr - :method :safe-url HTTP/:http-version :status :res[content-length] - :response-time ms " :user-agent"'
    : ':method :safe-url :status :response-time ms';
  return morgan(format);
}

safeRequestLogger.safePath = safePath;
module.exports = safeRequestLogger;

const PRIVATE_PREFIXES = [
  '/auth', '/dashboard', '/mcp', '/review', '/uploads',
  '/health', '/healthz', '/readyz', '/.well-known/oauth'
];

function isPrivatePath(path = '') {
  const value = String(path || '');
  return PRIVATE_PREFIXES.some((prefix) => value === prefix || value.startsWith(`${prefix}/`));
}

function noIndexPrivate(req, res, next) {
  if (isPrivatePath(req.path)) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  }
  return next();
}

noIndexPrivate.isPrivatePath = isPrivatePath;
module.exports = noIndexPrivate;

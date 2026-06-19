function requireAuth(req, res, next) {
  if (!req.user) {
    const nextPath = req.originalUrl && req.originalUrl.startsWith('/') ? req.originalUrl : '/dashboard';
    return res.redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }

  return next();
}

module.exports = requireAuth;

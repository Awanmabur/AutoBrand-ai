function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/auth/login');
  }

  return next();
}

module.exports = requireAuth;

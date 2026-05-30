function requireGuest(req, res, next) {
  if (req.user) {
    return res.redirect('/dashboard');
  }

  return next();
}

module.exports = requireGuest;

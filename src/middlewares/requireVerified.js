const AppError = require('../utils/AppError');

function requireVerified(req, res, next) {
  if (!req.user) return res.redirect('/auth/login');
  if (req.user.isVerified) return next();

  if (req.accepts(['html', 'json']) === 'json' || req.path.startsWith('/api/')) {
    return next(new AppError('Verify your email before using this feature.', 403));
  }
  return res.redirect(303, '/dashboard/settings?error=Verify%20your%20email%20before%20using%20this%20feature');
}

module.exports = requireVerified;

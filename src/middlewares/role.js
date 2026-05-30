const AppError = require('../utils/AppError');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login');
    if (req.user.role === 'super_admin' || roles.includes(req.user.role)) return next();
    return next(new AppError('You do not have access to this page.', 403));
  };
}

module.exports = requireRole;

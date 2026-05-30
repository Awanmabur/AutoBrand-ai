const { checkLimit, getCurrentPlan } = require('../services/subscription.service');
const AppError = require('../utils/AppError');

function requireActiveSubscription(req, res, next) {
  if (!req.user) return res.redirect('/auth/login');
  return getCurrentPlan(req.user)
    .then((plan) => {
      if (!plan) return res.redirect('/pricing');
      req.currentPlan = plan;
      return next();
    })
    .catch(next);
}

function requirePlanLimit(limitName, getCurrentValue) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.redirect('/auth/login');
      const used = typeof getCurrentValue === 'function' ? await getCurrentValue(req) : Number(getCurrentValue || 0);
      const result = await checkLimit(req.user, limitName, used);
      req.planLimit = result;
      if (result.allowed) return next();
      if (req.xhr || req.path.startsWith('/api') || req.accepts('json') && !req.accepts('html')) {
        return res.status(402).json({ error: 'Plan limit reached.', limit: result.limit, used: result.used, plan: result.plan?.slug });
      }
      return next(new AppError(`Your ${result.plan?.name || 'current'} plan limit has been reached. Upgrade to continue.`, 403, { title: 'Upgrade required' }));
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { requireActiveSubscription, requirePlanLimit };

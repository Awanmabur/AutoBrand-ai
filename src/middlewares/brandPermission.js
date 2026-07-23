const TeamMember = require('../models/TeamMember');
const AppError = require('../utils/AppError');
const { assertBrandAccess } = require('../services/authorization/brandAccess.service');

function requireBodyBrandPermission(permission) {
  return async (req, _res, next) => {
    try {
      req.brandAccess = await assertBrandAccess(req.user, req.body.brand || req.query.brand, permission, { status: 'active' });
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requireTeamMemberBrandPermission(permission) {
  return async (req, _res, next) => {
    try {
      const member = await TeamMember.findById(req.params.id).lean();
      if (!member) throw new AppError('Team member not found.', 404);
      req.teamMemberAccess = member;
      req.brandAccess = await assertBrandAccess(req.user, member.brand, permission, { status: 'active' });
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { requireBodyBrandPermission, requireTeamMemberBrandPermission };

const AdminRole = require('../models/AdminRole');
const TeamMember = require('../models/TeamMember');
const AppError = require('../utils/AppError');
const { permissionsForTeamRole } = require('../services/team/teamAccess.service');

const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  platform_admin: ['users.view', 'users.edit', 'content.view', 'content.moderate', 'analytics.view', 'settings.view', 'integrations.view', 'audit.view'],
  billing_admin: ['plans.view', 'plans.create', 'plans.edit', 'billing.view', 'billing.manage', 'analytics.view'],
  ai_manager: ['ai.view', 'ai.edit', 'plans.view', 'analytics.view'],
  integration_manager: ['integrations.view', 'integrations.edit', 'settings.view'],
  content_moderator: ['content.view', 'content.moderate', 'approvals.view', 'approvals.manage'],
  support_agent: ['users.view', 'billing.view', 'approvals.view'],
  analyst: ['analytics.view', 'audit.view'],
  agency_owner: ['team.manage', 'billing.view', 'content.view', 'content.create', 'content.edit', 'approvals.manage', 'handoff.manage', 'auto_mode.manage'],
  brand_owner: ['team.manage', 'billing.view', 'content.view', 'content.create', 'content.edit', 'approvals.manage', 'handoff.manage'],
  team_owner: ['team.manage', 'billing.view', 'content.view', 'content.create', 'content.edit', 'approvals.manage', 'handoff.manage'],
  team_member: ['content.view'],
  content_creator: ['content.view'],
  client_reviewer: ['approvals.view']
};

async function getPermissions(user) {
  if (!user) return [];
  const direct = Array.isArray(user.permissions) ? user.permissions : [];
  const rolePermissions = ROLE_PERMISSIONS[user.role] || [];
  let adminRolePermissions = [];
  let teamPermissions = [];
  if (user.adminRole) {
    const role = await AdminRole.findById(user.adminRole);
    if (role?.isActive) adminRolePermissions = role.permissions || [];
  }
  if (user._id) {
    const memberships = await TeamMember.find({ user: user._id, status: 'active' }).select('role permissions').lean();
    teamPermissions = memberships.flatMap((member) => permissionsForTeamRole(member.role, member.permissions));
  }
  return [...new Set([...rolePermissions, ...direct, ...adminRolePermissions, ...teamPermissions])];
}

function hasPermission(permissions, permission) {
  return permissions.includes('*') || permissions.includes(permission);
}

function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.redirect('/auth/login');
      const permissions = await getPermissions(req.user);
      if (!hasPermission(permissions, permission)) {
        throw new AppError('You do not have permission to access this area.', 403);
      }
      req.permissions = permissions;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.redirect('/auth/login');
  const adminRoles = ['super_admin', 'platform_admin', 'billing_admin', 'ai_manager', 'integration_manager', 'content_moderator', 'support_agent', 'analyst'];
  if (!adminRoles.includes(req.user.role)) return next(new AppError('Admin access required.', 403));
  return next();
}

function requireSuperadmin(req, res, next) {
  if (!req.user) return res.redirect('/auth/login');
  if (req.user.role !== 'super_admin') return next(new AppError('Superadmin access required.', 403));
  return next();
}

module.exports = { ROLE_PERMISSIONS, getPermissions, hasPermission, requireAdmin, requirePermission, requireSuperadmin };

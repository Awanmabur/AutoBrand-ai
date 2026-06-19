const TEAM_ROLES = ['owner', 'admin', 'manager', 'creator', 'approver', 'viewer', 'billing'];

const ROLE_ALIASES = {
  content_creator: 'creator',
  editor: 'creator',
  reviewer: 'approver',
  team_owner: 'owner'
};

const TEAM_ROLE_PERMISSIONS = {
  owner: ['team.manage', 'billing.view', 'billing.manage', 'brand.manage', 'content.create', 'content.edit', 'content.publish', 'schedule.manage', 'approvals.manage', 'analytics.view'],
  admin: ['team.manage', 'brand.manage', 'content.create', 'content.edit', 'content.publish', 'schedule.manage', 'approvals.manage', 'analytics.view'],
  manager: ['brand.manage', 'content.create', 'content.edit', 'schedule.manage', 'approvals.manage', 'analytics.view'],
  creator: ['content.create', 'content.edit', 'schedule.manage', 'analytics.view'],
  approver: ['approvals.view', 'approvals.manage', 'content.view', 'analytics.view'],
  viewer: ['content.view', 'analytics.view'],
  billing: ['billing.view', 'billing.manage']
};

const PERMISSION_ALIASES = {
  brand_read: 'brand.view',
  content_create: 'content.create',
  content_edit: 'content.edit',
  schedule_posts: 'schedule.manage',
  approve_posts: 'approvals.manage',
  analytics_read: 'analytics.view'
};

function normalizeTeamRole(role = 'viewer') {
  const key = String(role || 'viewer').trim().toLowerCase();
  const normalized = ROLE_ALIASES[key] || key;
  return TEAM_ROLES.includes(normalized) ? normalized : 'viewer';
}

function normalizeTeamPermissions(value = []) {
  const items = Array.isArray(value) ? value : value ? String(value).split(/[\n,]+/) : [];
  return [...new Set(items.map((permission) => {
    const key = String(permission || '').trim();
    return PERMISSION_ALIASES[key] || key;
  }).filter(Boolean))];
}

function permissionsForTeamRole(role = 'viewer', extra = []) {
  const normalized = normalizeTeamRole(role);
  return [...new Set([...(TEAM_ROLE_PERMISSIONS[normalized] || []), ...normalizeTeamPermissions(extra)])];
}

function canManageTeam(userPermissions = []) {
  return userPermissions.includes('*') || userPermissions.includes('team.manage');
}

module.exports = {
  PERMISSION_ALIASES,
  TEAM_ROLE_PERMISSIONS,
  TEAM_ROLES,
  canManageTeam,
  normalizeTeamPermissions,
  normalizeTeamRole,
  permissionsForTeamRole
};

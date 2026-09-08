const Brand = require('../../models/Brand');
const TeamMember = require('../../models/TeamMember');
const { isAdminRole, pagesForRole } = require('../subscription/featureAccess.service');
const { permissionsForTeamRole } = require('../team/teamAccess.service');

const ALWAYS = ['overview', 'notifications', 'settings', 'errors'];

function pagesForPermissions(permissions = []) {
  const set = new Set(permissions || []);
  if (set.has('*')) return pagesForRole('brand_owner');
  const pages = new Set(ALWAYS);
  const has = (permission) => set.has(permission);
  const some = (prefix) => [...set].some((permission) => permission.startsWith(prefix));

  if (some('content.') || has('schedule.manage') || has('approvals.manage')) pages.add('content-library');
  if (has('content.create') || has('content.edit')) pages.add('media');
  if (has('content.create')) {
    pages.add('quick-create');
    pages.add('campaigns');
    pages.add('video-system');
    pages.add('avatar-video');
  }
  if (has('brand.manage')) pages.add('brand-brain');
  if (has('social.manage')) pages.add('social');
  if (has('schedule.manage')) pages.add('calendar');
  if (has('approvals.manage') || has('approvals.view')) pages.add('approvals');
  if (has('analytics.view')) pages.add('analytics');
  if (has('team.manage')) pages.add('team');
  if (has('billing.manage') || has('billing.view')) pages.add('billing');
  return [...pages];
}

async function workspaceDashboardPages(user) {
  if (!user?._id) return ALWAYS;
  if (user.role === 'super_admin' || isAdminRole(user.role)) return pagesForRole(user.role);

  const [ownedCount, memberships] = await Promise.all([
    Brand.countDocuments({ owner: user._id, status: 'active' }),
    TeamMember.find({ user: user._id, status: 'active' }).select('role permissions').lean()
  ]);

  const pages = new Set(ALWAYS);
  if (ownedCount > 0) pagesForRole(user.role).forEach((page) => pages.add(page));
  memberships.forEach((membership) => {
    pagesForPermissions(permissionsForTeamRole(membership.role, membership.permissions)).forEach((page) => pages.add(page));
  });
  if (!memberships.length && ownedCount === 0) pagesForRole(user.role).forEach((page) => pages.add(page));
  return [...pages];
}

module.exports = { ALWAYS, pagesForPermissions, workspaceDashboardPages };

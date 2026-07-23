const mongoose = require('mongoose');
const Brand = require('../../models/Brand');
const TeamMember = require('../../models/TeamMember');
const AppError = require('../../utils/AppError');
const { permissionsForTeamRole } = require('../team/teamAccess.service');

function id(value) {
  return value?._id?.toString?.() || value?.toString?.() || String(value || '');
}

function permissionSatisfied(permissions, required) {
  const set = new Set(permissions || []);
  if (set.has('*') || set.has(required)) return true;
  if (required === 'brand.view') return true;
  if (required === 'content.view') return [...set].some((item) => item.startsWith('content.') || item === 'schedule.manage' || item === 'approvals.manage');
  if (required === 'analytics.view') return set.has('content.view') || set.has('content.create') || set.has('content.edit');
  return false;
}

async function membershipForBrand(user, brandId) {
  if (!user?._id || !mongoose.isValidObjectId(brandId)) return null;
  return TeamMember.findOne({ brand: brandId, user: user._id, status: 'active' }).lean();
}

async function canAccessBrand(user, brand, permission = 'brand.view') {
  if (!user || !brand) return false;
  if (id(brand.owner) === id(user._id)) return true;
  const membership = await membershipForBrand(user, brand._id || brand);
  if (!membership) return false;
  return permissionSatisfied(permissionsForTeamRole(membership.role, membership.permissions), permission);
}

async function findAccessibleBrand(user, brandId, permission = 'brand.view', extraFilter = {}) {
  if (!mongoose.isValidObjectId(brandId)) return null;
  const brand = await Brand.findOne({ _id: brandId, ...extraFilter });
  if (!brand) return null;
  return (await canAccessBrand(user, brand, permission)) ? brand : null;
}

async function assertBrandAccess(user, brandId, permission = 'brand.view', extraFilter = {}) {
  const brand = await findAccessibleBrand(user, brandId, permission, extraFilter);
  if (!brand) throw new AppError('Brand not found or access denied.', 404);
  return brand;
}

async function accessibleBrandIds(user, permission = 'brand.view', { status = 'active' } = {}) {
  if (!user?._id) return [];
  const [owned, memberships] = await Promise.all([
    Brand.find({ owner: user._id, ...(status ? { status } : {}) }).select('_id').lean(),
    TeamMember.find({ user: user._id, status: 'active' }).select('brand role permissions').lean()
  ]);
  const memberBrandIds = memberships
    .filter((member) => permissionSatisfied(permissionsForTeamRole(member.role, member.permissions), permission))
    .map((member) => member.brand);
  return [...new Set([...owned.map((brand) => id(brand._id)), ...memberBrandIds.map(id)])]
    .filter(mongoose.isValidObjectId)
    .map((value) => new mongoose.Types.ObjectId(value));
}

async function brandPermissions(user, brandId) {
  const brand = await Brand.findById(brandId).select('owner').lean();
  if (!brand) return [];
  if (id(brand.owner) === id(user?._id)) return ['*'];
  const membership = await membershipForBrand(user, brandId);
  return membership ? permissionsForTeamRole(membership.role, membership.permissions) : [];
}

module.exports = {
  accessibleBrandIds,
  assertBrandAccess,
  brandPermissions,
  canAccessBrand,
  findAccessibleBrand,
  permissionSatisfied
};

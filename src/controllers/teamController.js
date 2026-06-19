const crypto = require('crypto');
const Brand = require('../models/Brand');
const TeamMember = require('../models/TeamMember');
const Notification = require('../models/Notification');
const { assertCanInviteTeam } = require('../services/usageLimitService');
const { normalizeTeamPermissions, normalizeTeamRole, permissionsForTeamRole } = require('../services/team/teamAccess.service');
const env = require('../config/env');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizePermissions(value) {
  return normalizeTeamPermissions(value);
}

async function index(req, res) {
  return res.redirect(303, '/dashboard/team');
}

async function invite(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await assertCanInviteTeam(req.user);

    const token = crypto.randomBytes(32).toString('hex');
    await TeamMember.create({
      brand: brand._id,
      invitedBy: req.user._id,
      email: req.body.email,
      name: req.body.name,
      role: normalizeTeamRole(req.body.role),
      permissions: permissionsForTeamRole(req.body.role, req.body.permissions),
      inviteTokenHash: hashToken(token),
      inviteExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
    });

    res.redirect(`/dashboard/team?invite=${token}`);
  } catch (error) {
    next(error);
  }
}

async function accept(req, res, next) {
  try {
    const tokenHash = hashToken(req.query.token || '');
    const member = await TeamMember.findOne({
      inviteTokenHash: tokenHash,
      status: 'invited',
      inviteExpiresAt: { $gte: new Date() }
    });
    if (!member) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    member.user = req.user._id;
    member.status = 'active';
    member.acceptedAt = new Date();
    member.inviteTokenHash = undefined;
    await member.save();
    await Notification.create({
      user: member.invitedBy,
      type: 'team_invite_accepted',
      title: 'Team invite accepted',
      message: `${member.name || member.email} accepted the invitation.`,
      entityType: 'TeamMember',
      entityId: member._id
    });

    res.redirect('/dashboard/team?accepted=1');
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const member = await TeamMember.findOne({ _id: req.params.id, invitedBy: req.user._id, status: { $ne: 'removed' } });
    if (!member) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    if (req.body.brand) {
      const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
      if (brand) member.brand = brand._id;
    }
    member.role = req.body.role ? normalizeTeamRole(req.body.role) : member.role;
    if (req.body.permissions || req.body.role) member.permissions = permissionsForTeamRole(member.role, req.body.permissions || member.permissions);
    await member.save();

    res.redirect('/dashboard/team');
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    await TeamMember.findOneAndUpdate({ _id: req.params.id, invitedBy: req.user._id }, { status: 'removed' });
    res.redirect('/dashboard/team');
  } catch (error) {
    next(error);
  }
}

function inviteLink(req) {
  return req.query.invite ? `${env.appUrl}/dashboard/actions/team/accept?token=${req.query.invite}` : null;
}

module.exports = { accept, index, invite, inviteLink, remove, update };

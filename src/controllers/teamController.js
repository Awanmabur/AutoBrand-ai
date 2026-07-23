const crypto = require('crypto');
const TeamMember = require('../models/TeamMember');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { assertCanInviteTeam } = require('../services/usageLimitService');
const { normalizeTeamPermissions, normalizeTeamRole, permissionsForTeamRole } = require('../services/team/teamAccess.service');
const { normalizeEmail, validateEmail } = require('../services/account/account.service');
const { isEmailConfigured, sendTeamInviteEmail } = require('../services/emailService');
const env = require('../config/env');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function normalizePermissions(value) {
  return normalizeTeamPermissions(value);
}

async function audit(req, action, member, metadata = {}) {
  await AuditLog.create({
    user: req.user._id,
    action,
    entityType: 'TeamMember',
    entityId: member?._id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata
  }).catch(() => {});
}

async function index(req, res) {
  return res.redirect(303, '/dashboard/team');
}

async function invite(req, res, next) {
  try {
    if (!isEmailConfigured()) {
      const error = new Error('Team invitation email is unavailable. Configure SMTP before inviting team members.');
      error.status = 503;
      throw error;
    }
    const brand = req.brandAccess;
    await assertCanInviteTeam(req.user);
    const email = validateEmail(req.body.email);
    if (email === normalizeEmail(req.user.email)) throw new Error('You already own or belong to this workspace.');

    const token = crypto.randomBytes(32).toString('base64url');
    const role = normalizeTeamRole(req.body.role);
    const member = await TeamMember.findOneAndUpdate(
      { brand: brand._id, email },
      {
        $set: {
          invitedBy: req.user._id,
          name: String(req.body.name || '').trim().slice(0, 120),
          role,
          permissions: permissionsForTeamRole(role, req.body.permissions),
          status: 'invited',
          inviteTokenHash: hashToken(token),
          inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          user: undefined,
          acceptedAt: undefined
        }
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const delivery = await sendTeamInviteEmail({ member, brandName: brand.name, inviterName: req.user.name, token });
    await audit(req, 'team.invited', member, { brand: brand._id, role, email });
    const developmentInvite = !delivery.delivered && env.allowDevelopmentEmailLinks ? `&invite=${encodeURIComponent(token)}` : '';
    return res.redirect(303, `/dashboard/team?notice=${encodeURIComponent('Invitation sent.')}${developmentInvite}`);
  } catch (error) {
    return next(error);
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
    if (!member) return res.status(404).render('dashboard/pages/error', { layout: 'layouts/dashboard' });
    if (normalizeEmail(member.email) !== normalizeEmail(req.user.email)) {
      const error = new Error(`Sign in with ${member.email} to accept this invitation.`);
      error.status = 403;
      throw error;
    }

    member.user = req.user._id;
    member.status = 'active';
    member.acceptedAt = new Date();
    member.inviteTokenHash = undefined;
    member.inviteExpiresAt = undefined;
    await member.save();
    await Notification.create({
      user: member.invitedBy,
      type: 'team_invite_accepted',
      title: 'Team invite accepted',
      message: `${member.name || member.email} accepted the invitation.`,
      entityType: 'TeamMember',
      entityId: member._id
    });
    await audit(req, 'team.invite_accepted', member, { brand: member.brand });
    return res.redirect('/dashboard/team?accepted=1');
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const member = await TeamMember.findOne({ _id: req.params.id, brand: req.brandAccess._id, status: { $ne: 'removed' } });
    if (!member) return res.status(404).render('dashboard/pages/error', { layout: 'layouts/dashboard' });
    if (member.role === 'owner') throw new Error('The workspace owner role cannot be changed.');

    member.role = req.body.role ? normalizeTeamRole(req.body.role) : member.role;
    if (req.body.permissions || req.body.role) member.permissions = permissionsForTeamRole(member.role, req.body.permissions || member.permissions);
    await member.save();
    await audit(req, 'team.member_updated', member, { role: member.role });
    return res.redirect('/dashboard/team');
  } catch (error) {
    return next(error);
  }
}

async function remove(req, res, next) {
  try {
    const member = await TeamMember.findOne({ _id: req.params.id, brand: req.brandAccess._id, status: { $ne: 'removed' } });
    if (!member) return res.status(404).render('dashboard/pages/error', { layout: 'layouts/dashboard' });
    if (member.role === 'owner') throw new Error('The workspace owner cannot be removed.');
    member.status = 'removed';
    member.inviteTokenHash = undefined;
    member.inviteExpiresAt = undefined;
    await member.save();
    await audit(req, 'team.member_removed', member);
    return res.redirect('/dashboard/team');
  } catch (error) {
    return next(error);
  }
}

function inviteLink(req) {
  return req.query.invite && env.allowDevelopmentEmailLinks
    ? `${env.appUrl}/dashboard/actions/team/accept?token=${req.query.invite}`
    : null;
}

module.exports = { accept, index, invite, inviteLink, normalizePermissions, remove, update };

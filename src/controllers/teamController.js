const crypto = require('crypto');
const Brand = require('../models/Brand');
const TeamMember = require('../models/TeamMember');
const { assertCanInviteTeam } = require('../services/usageLimitService');
const env = require('../config/env');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizePermissions(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

async function index(req, res, next) {
  try {
    const [brands, members] = await Promise.all([
      Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 }),
      TeamMember.find({ invitedBy: req.user._id, status: { $ne: 'removed' } }).populate('brand').sort({ createdAt: -1 })
    ]);

    res.render('team/index', {
      title: 'Team',
      layout: 'layouts/dashboard',
      brands,
      members,
      error: null,
      accepted: req.query.accepted || null,
      inviteUrl: inviteLink(req)
    });
  } catch (error) {
    next(error);
  }
}

async function invite(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });
    await assertCanInviteTeam(req.user);

    const token = crypto.randomBytes(32).toString('hex');
    await TeamMember.create({
      brand: brand._id,
      invitedBy: req.user._id,
      email: req.body.email,
      name: req.body.name,
      role: req.body.role,
      permissions: normalizePermissions(req.body.permissions),
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
    if (!member) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    member.user = req.user._id;
    member.status = 'active';
    member.acceptedAt = new Date();
    member.inviteTokenHash = undefined;
    await member.save();

    res.redirect('/dashboard/team?accepted=1');
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const member = await TeamMember.findOne({ _id: req.params.id, invitedBy: req.user._id, status: { $ne: 'removed' } });
    if (!member) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    member.role = req.body.role || member.role;
    if (req.body.permissions) member.permissions = normalizePermissions(req.body.permissions);
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
  return req.query.invite ? `${env.appUrl}/team/accept?token=${req.query.invite}` : null;
}

module.exports = { accept, index, invite, inviteLink, remove, update };

const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const googleDrive = require('../services/storage/googleDrive.service');
const { assertPlanFeature } = require('../services/usageLimitService');
const { setTransientCookie, getTransientCookie, clearTransientCookie } = require('../services/transientCookie.service');

async function audit(req, action, metadata = {}) {
  await AuditLog.create({ user: req.user._id, action, entityType: 'CloudStorageConnection', entityId: req.user._id, ipAddress: req.ip, userAgent: req.get('user-agent'), metadata });
}

async function googleDriveStart(req, res, next) {
  try {
    await assertPlanFeature(req.user, 'googleDriveAccess', 'Google Drive asset storage');
    if (!googleDrive.isConfigured()) return res.redirect('/dashboard/settings?error=Google%20Drive%20OAuth%20is%20not%20configured');
    const state = googleDrive.createState();
    const { verifier, challenge } = googleDrive.createPkcePair();
    setTransientCookie(res, 'google-drive-oauth-state', state, 10 * 60 * 1000);
    setTransientCookie(res, 'google-drive-pkce', verifier, 10 * 60 * 1000);
    await audit(req, 'storage.google_drive.connect_started');
    return res.redirect(303, googleDrive.buildAuthUrl({ state, codeChallenge: challenge }));
  } catch (error) { return next(error); }
}

async function googleDriveCallback(req, res, next) {
  try {
    await assertPlanFeature(req.user, 'googleDriveAccess', 'Google Drive asset storage');
    const expectedState = String(getTransientCookie(req, 'google-drive-oauth-state') || '');
    const verifier = String(getTransientCookie(req, 'google-drive-pkce') || '');
    clearTransientCookie(res, 'google-drive-oauth-state');
    clearTransientCookie(res, 'google-drive-pkce');
    if (!expectedState || !req.query.state || !crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(String(req.query.state).padEnd(expectedState.length, '\0').slice(0, expectedState.length))) || String(req.query.state).length !== expectedState.length) {
      return res.redirect('/dashboard/settings?error=Invalid%20Google%20Drive%20OAuth%20state');
    }
    if (!req.query.code || !verifier) return res.redirect('/dashboard/settings?error=Google%20Drive%20authorization%20was%20not%20completed');
    const connection = await googleDrive.connectUser({ user: req.user, code: String(req.query.code), codeVerifier: verifier });
    await audit(req, 'storage.google_drive.connected', { accountEmail: connection.accountEmail, rootFolderId: connection.rootFolderId });
    return res.redirect('/dashboard/settings?notice=Google%20Drive%20connected.%20AutoBrand%20created%20your%20asset%20workspace.');
  } catch (error) { return next(error); }
}

async function googleDriveDisconnect(req, res, next) {
  try {
    await assertPlanFeature(req.user, 'googleDriveAccess', 'Google Drive asset storage');
    await googleDrive.disconnect(req.user._id);
    if (req.user.assetStoragePreference !== 'platform') {
      await User.updateOne({ _id: req.user._id }, { $set: { assetStoragePreference: 'platform' } });
    }
    await audit(req, 'storage.google_drive.disconnected');
    return res.redirect('/dashboard/settings?notice=Google%20Drive%20disconnected');
  } catch (error) { return next(error); }
}

async function storagePreference(req, res, next) {
  try {
    const preference = String(req.body.assetStoragePreference || 'platform');
    if (preference !== 'platform') await assertPlanFeature(req.user, 'googleDriveAccess', 'Google Drive asset storage');
    if (!['platform', 'google_drive', 'both'].includes(preference)) return res.redirect('/dashboard/settings?error=Invalid%20storage%20preference');
    if (preference !== 'platform') await googleDrive.getConnection(req.user._id, { required: true });
    await User.updateOne({ _id: req.user._id }, { $set: { assetStoragePreference: preference } });
    await audit(req, 'storage.preference.updated', { preference });
    return res.redirect('/dashboard/settings?notice=Asset%20storage%20preference%20updated');
  } catch (error) { return next(error); }
}

module.exports = { googleDriveStart, googleDriveCallback, googleDriveDisconnect, storagePreference };

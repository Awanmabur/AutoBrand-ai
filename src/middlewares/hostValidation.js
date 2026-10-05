const env = require('../config/env');

function normalizeHostname(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || /[\s\\/]/.test(raw)) return '';
  try {
    return new URL(`http://${raw}`).hostname.toLowerCase();
  } catch (_error) {
    return '';
  }
}

function hostnameFromUrl(value = '') {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch (_error) { return ''; }
}

function allowedHostnames() {
  return new Set([
    hostnameFromUrl(env.appUrl),
    hostnameFromUrl(env.publicAppUrl),
    ...(env.allowedHosts || [])
  ].filter(Boolean));
}

function hostValidation(req, res, next) {
  if (env.nodeEnv !== 'production' || ['/health','/healthz','/readyz'].includes(req.path)) return next();
  const allowed = allowedHostnames();
  const hostname = normalizeHostname(req.get('host'));
  if (!hostname || !allowed.has(hostname)) {
    return res.status(421).json({ error: 'Misdirected request.' });
  }
  return next();
}

hostValidation.allowedHostnames = allowedHostnames;
hostValidation.normalizeHostname = normalizeHostname;
module.exports = hostValidation;

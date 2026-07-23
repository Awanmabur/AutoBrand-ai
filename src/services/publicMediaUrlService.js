const env = require('../config/env');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isPublicHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return !LOCAL_HOSTS.has(url.hostname.toLowerCase()) && !url.hostname.toLowerCase().endsWith('.localhost');
  } catch (error) {
    return false;
  }
}

function configuredPublicOrigin() {
  const candidate = [env.publicAppUrl, env.appUrl].find((value) => isPublicHttpUrl(value));
  if (!candidate) return '';
  try {
    return new URL(candidate).origin;
  } catch (error) {
    return '';
  }
}

function publicMediaUrl(fileUrl) {
  const value = String(fileUrl || '').trim();
  if (!value) return '';
  if (isPublicHttpUrl(value)) return value;

  const origin = configuredPublicOrigin();
  if (!origin) return '';
  try {
    return new URL(value.replace(/^public[\\/]/, '/'), `${origin}/`).toString();
  } catch (error) {
    return '';
  }
}

module.exports = {
  configuredPublicOrigin,
  isPublicHttpUrl,
  publicMediaUrl
};

const Notification = require('../models/Notification');

const LOW_CREDIT_THRESHOLD = 20;

function userId(value) {
  return value?._id || value || null;
}

async function notifyUser({ user, type, title, message = '', severity = 'info', entityType = '', entityId = null, actionUrl = '', metadata = {} } = {}) {
  const id = userId(user);
  if (!id || !type || !title) return null;
  return Notification.create({
    user: id,
    type,
    title,
    message,
    severity,
    entityType,
    entityId,
    actionUrl,
    metadata
  });
}

async function notifyLowCredits({ user, balance, threshold = LOW_CREDIT_THRESHOLD } = {}) {
  if (Number(balance) > Number(threshold)) return null;
  return notifyUser({
    user,
    type: 'low_credits',
    title: 'Low credits',
    message: `Your credit balance is ${Number(balance || 0)}. Add credits or upgrade before running more AI workflows.`,
    severity: 'warning',
    actionUrl: '/dashboard/billing',
    metadata: { balance, threshold }
  });
}

async function notifyPayment({ user, payment, status, planName = '' } = {}) {
  const paid = status === 'paid';
  const failed = ['failed', 'refunded'].includes(status);
  return notifyUser({
    user: user || payment?.user,
    type: paid ? 'payment_success' : failed ? 'payment_failed' : 'payment_pending',
    title: paid ? 'Payment confirmed' : failed ? 'Payment failed' : 'Payment pending',
    message: paid
      ? `${planName || payment?.metadata?.plan || 'Plan'} is active.`
      : failed
        ? `Payment ${payment?.reference || ''} could not be confirmed.`
        : `Payment ${payment?.reference || ''} is still pending.`,
    severity: paid ? 'success' : failed ? 'error' : 'warning',
    entityType: 'Payment',
    entityId: payment?._id,
    actionUrl: '/dashboard/billing',
    metadata: { status, planName, reference: payment?.reference }
  });
}

async function notifyVideoRendered({ user, job, brand, avatar = false } = {}) {
  return notifyUser({
    user: user || job?.createdBy,
    type: avatar ? 'avatar_video_rendered' : 'video_rendered',
    title: avatar ? 'Avatar video rendered' : 'Video rendered',
    message: `${brand?.name || 'Your brand'} ${avatar ? 'avatar ' : ''}video is ready in the media library.`,
    severity: 'success',
    entityType: 'AiVideoJob',
    entityId: job?._id,
    actionUrl: '/dashboard/video-system',
    metadata: { outputUrl: job?.outputUrl, outputMedia: job?.outputMedia }
  });
}

async function notifyAccountDisconnected({ user, account, health } = {}) {
  return notifyUser({
    user: user || account?.owner,
    type: 'account_disconnected',
    title: `${account?.platform || 'Social account'} needs attention`,
    message: health?.message || account?.lastPublishError || 'Reconnect this account before publishing.',
    severity: 'warning',
    entityType: 'SocialAccount',
    entityId: account?._id,
    actionUrl: '/dashboard/social',
    metadata: { platform: account?.platform, status: account?.status, healthStatus: health?.status }
  });
}

module.exports = {
  LOW_CREDIT_THRESHOLD,
  notifyAccountDisconnected,
  notifyLowCredits,
  notifyPayment,
  notifyUser,
  notifyVideoRendered
};

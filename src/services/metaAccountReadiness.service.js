const SocialAccount = require('../models/SocialAccount');

const LEGACY_INSTAGRAM_RECONNECT_MESSAGE = 'Reconnect this Instagram account through Meta. The previous connection was not verified for instagram_content_publish.';

async function markLegacyInstagramAccountsForReconnect() {
  const result = await SocialAccount.updateMany(
    {
      platform: 'instagram',
      status: 'connected',
      'providerMeta.permissionGrantVerifiedAt': { $exists: false }
    },
    {
      $set: {
        status: 'needs_reconnect',
        healthStatus: 'warning',
        reconnectRequiredAt: new Date(),
        lastPublishError: LEGACY_INSTAGRAM_RECONNECT_MESSAGE
      }
    }
  );

  if (result.modifiedCount) {
    console.warn('[meta] legacy Instagram connections require reconnect', {
      count: result.modifiedCount,
      reason: LEGACY_INSTAGRAM_RECONNECT_MESSAGE
    });
  }
  return result;
}

module.exports = {
  LEGACY_INSTAGRAM_RECONNECT_MESSAGE,
  markLegacyInstagramAccountsForReconnect
};

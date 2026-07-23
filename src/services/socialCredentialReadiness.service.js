const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const { canDecryptToken } = require('./tokenCryptoService');

const CREDENTIAL_FAILURE_MESSAGE = 'Selected social account credentials cannot be decrypted. Restore the previous TOKEN_ENCRYPTION_KEY or reconnect the affected account, then publish again.';

async function markUndecryptableSocialAccountsForReconnect({ limit = 1000 } = {}) {
  const accounts = await SocialAccount.find({
    accessTokenEncrypted: { $exists: true, $nin: ['', null] },
    $or: [
      { status: 'connected' },
      { status: 'needs_reconnect', 'providerMeta.credentialEncryption.reason': 'token_decryption_failed' },
      { status: 'needs_reconnect', lastPublishError: /cannot be decrypted|unsupported state or unable to authenticate data|unable to authenticate data/i }
    ]
  })
    .select('_id platform accountName accessTokenEncrypted providerMeta')
    .limit(Math.max(1, Math.min(5000, Number(limit || 1000))));

  const now = new Date();
  const affectedAccountIds = [];
  const failures = [];
  const restored = [];

  for (const account of accounts) {
    const check = canDecryptToken(account.accessTokenEncrypted);
    if (check.ok) {
      if (account.status === 'needs_reconnect' && account.providerMeta?.credentialEncryption?.reason === 'token_decryption_failed') {
        account.status = 'connected';
        account.healthStatus = 'unknown';
        account.reconnectRequiredAt = undefined;
        account.lastPublishError = '';
        account.providerMeta = {
          ...(account.providerMeta || {}),
          credentialEncryption: {
            status: 'ready',
            reason: 'key_restored',
            checkedAt: now
          }
        };
        account.markModified('providerMeta');
        await account.save();
        restored.push({ accountId: String(account._id), platform: account.platform, accountName: account.accountName });
      }
      continue;
    }

    affectedAccountIds.push(account._id);
    failures.push({
      accountId: String(account._id),
      platform: account.platform,
      accountName: account.accountName,
      error: check.error?.message || CREDENTIAL_FAILURE_MESSAGE
    });
    account.status = 'needs_reconnect';
    account.healthStatus = 'failed';
    account.reconnectRequiredAt = now;
    account.lastHealthCheckAt = now;
    account.lastPublishError = check.error?.message || CREDENTIAL_FAILURE_MESSAGE;
    account.providerMeta = {
      ...(account.providerMeta || {}),
      credentialEncryption: {
        status: 'needs_reconnect',
        reason: 'token_decryption_failed',
        checkedAt: now
      }
    };
    account.markModified('providerMeta');
    await account.save();
  }

  let stoppedPosts = 0;
  if (affectedAccountIds.length) {
    const result = await Post.updateMany(
      {
        status: { $in: ['scheduled', 'publishing'] },
        targetAccounts: { $in: affectedAccountIds }
      },
      {
        $set: {
          status: 'failed',
          errorMessage: CREDENTIAL_FAILURE_MESSAGE,
          scheduledAt: null,
          'platformMetadata.retry.retryable': false,
          'platformMetadata.retry.reason': 'credential_reconnect_required',
          'platformMetadata.retry.lastError': CREDENTIAL_FAILURE_MESSAGE,
          'platformMetadata.retry.lastCheckedAt': now
        },
        $unset: {
          publishingStartedAt: '',
          publishingAttemptId: ''
        },
        $inc: { scheduleVersion: 1 }
      }
    );
    stoppedPosts = result.modifiedCount || 0;
  }

  if (failures.length) {
    console.warn('[security] connected social accounts require reconnect because stored tokens cannot be decrypted', {
      count: failures.length,
      stoppedPosts,
      accounts: failures.map(({ platform, accountName }) => ({ platform, accountName })),
      action: 'Restore the old key with TOKEN_ENCRYPTION_KEY_PREVIOUS or reconnect these accounts after configuring a stable TOKEN_ENCRYPTION_KEY.'
    });
  }

  return { checked: accounts.length, affected: failures.length, restored: restored.length, stoppedPosts, failures, restoredAccounts: restored };
}

module.exports = {
  CREDENTIAL_FAILURE_MESSAGE,
  markUndecryptableSocialAccountsForReconnect
};

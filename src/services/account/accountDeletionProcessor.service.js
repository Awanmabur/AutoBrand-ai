const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const env = require('../../config/env');
const User = require('../../models/User');
const Brand = require('../../models/Brand');
const Post = require('../../models/Post');
const Campaign = require('../../models/Campaign');
const Media = require('../../models/Media');
const BrandAsset = require('../../models/BrandAsset');
const AiJob = require('../../models/AiJob');
const AiVideoJob = require('../../models/AiVideoJob');
const Analytics = require('../../models/Analytics');
const AnalyticsSyncJob = require('../../models/AnalyticsSyncJob');
const GrowthAsset = require('../../models/GrowthAsset');
const AvatarProfile = require('../../models/AvatarProfile');
const AvatarConsent = require('../../models/AvatarConsent');
const VideoRender = require('../../models/VideoRender');
const SocialAccount = require('../../models/SocialAccount');
const Approval = require('../../models/Approval');
const ApprovalComment = require('../../models/ApprovalComment');
const ClientApprovalLink = require('../../models/ClientApprovalLink');
const TeamMember = require('../../models/TeamMember');
const UsageLog = require('../../models/UsageLog');
const UsageRecord = require('../../models/UsageRecord');
const Notification = require('../../models/Notification');
const ApiLog = require('../../models/ApiLog');
const AuditLog = require('../../models/AuditLog');
const RefreshToken = require('../../models/RefreshToken');
const CreditLedger = require('../../models/CreditLedger');
const McpAuthorizationCode = require('../../models/McpAuthorizationCode');
const McpRefreshToken = require('../../models/McpRefreshToken');
const McpOAuthGrant = require('../../models/McpOAuthGrant');
const McpRevokedAccessToken = require('../../models/McpRevokedAccessToken');
const CloudStorageConnection = require('../../models/CloudStorageConnection');
const Subscription = require('../../models/Subscription');
const Payment = require('../../models/Payment');
const PublicInquiry = require('../../models/PublicInquiry');
const PrivilegedLoginChallenge = require('../../models/PrivilegedLoginChallenge');
const { deleteGridFsFile, gridFsIdFromUrl } = require('../gridFsMediaStorage.service');
const { cloudinary, isCloudinaryConfigured } = require('../../config/cloudinary');
const googleDrive = require('../storage/googleDrive.service');

const LEASE_MS = 15 * 60 * 1000;
let timer = null;
let running = false;

function deletedIdentity(userId) {
  const digest = crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 24);
  return {
    name: 'Deleted user',
    email: `deleted-${digest}@deleted.autobrand.invalid`
  };
}

function resourceType(asset = {}) {
  if (asset.fileType === 'video' || String(asset.mimeType || '').startsWith('video/')) return 'video';
  if (asset.fileType === 'image' || String(asset.mimeType || '').startsWith('image/')) return 'image';
  return 'raw';
}

async function removeStoredAsset(asset = {}) {
  const fileUrl = String(asset.fileUrl || asset.url || '');
  const gridFsId = gridFsIdFromUrl(fileUrl);
  if (gridFsId) {
    await deleteGridFsFile(gridFsId).catch((error) => console.warn('[account-deletion] GridFS cleanup failed', error.message));
    return;
  }

  const publicId = String(asset.publicId || '');
  if (isCloudinaryConfigured() && publicId && !/^https?:\/\//i.test(publicId) && !publicId.startsWith('gridfs:') && typeof cloudinary.uploader?.destroy === 'function') {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType(asset), invalidate: true }).catch((error) => {
      console.warn('[account-deletion] Cloudinary cleanup failed', { publicId, message: error.message });
    });
    return;
  }

  if (fileUrl.startsWith('/uploads/') && !fileUrl.startsWith('/uploads/drive/')) {
    const publicRoot = path.resolve(process.cwd(), 'public');
    const absolute = path.resolve(publicRoot, `.${fileUrl.split(/[?#]/)[0]}`);
    if (absolute.startsWith(`${publicRoot}${path.sep}`)) await fs.unlink(absolute).catch(() => {});
  }
}

async function purgeOwnedWorkspaces(userId) {
  const brandIds = await Brand.find({ owner: userId }).distinct('_id');
  if (!brandIds.length) return { brandCount: 0, mediaCount: 0 };

  const [mediaRows, assetRows, approvalIds, avatarIds] = await Promise.all([
    Media.find({ brand: { $in: brandIds } }).select('fileUrl publicId fileType mimeType').lean(),
    BrandAsset.find({ brand: { $in: brandIds } }).select('url publicId mimeType').lean(),
    Approval.find({ brand: { $in: brandIds } }).distinct('_id'),
    AvatarProfile.find({ brand: { $in: brandIds } }).distinct('_id')
  ]);

  const storageResults = await Promise.allSettled([...mediaRows, ...assetRows].map(removeStoredAsset));
  const storageFailures = storageResults.filter((result) => result.status === 'rejected').length;
  if (storageFailures) console.warn('[account-deletion] some stored assets could not be removed', { userId: String(userId), storageFailures });

  await Promise.all([
    ApprovalComment.deleteMany({ approval: { $in: approvalIds } }),
    AvatarConsent.deleteMany({ avatarProfile: { $in: avatarIds } }),
    ClientApprovalLink.deleteMany({ brand: { $in: brandIds } }),
    Approval.deleteMany({ brand: { $in: brandIds } }),
    Post.deleteMany({ brand: { $in: brandIds } }),
    Campaign.deleteMany({ brand: { $in: brandIds } }),
    Analytics.deleteMany({ brand: { $in: brandIds } }),
    AnalyticsSyncJob.deleteMany({ brand: { $in: brandIds } }),
    AiJob.deleteMany({ brand: { $in: brandIds } }),
    AiVideoJob.deleteMany({ brand: { $in: brandIds } }),
    GrowthAsset.deleteMany({ brand: { $in: brandIds } }),
    VideoRender.deleteMany({ brand: { $in: brandIds } }),
    AvatarProfile.deleteMany({ brand: { $in: brandIds } }),
    Media.deleteMany({ brand: { $in: brandIds } }),
    BrandAsset.deleteMany({ brand: { $in: brandIds } }),
    SocialAccount.deleteMany({ brand: { $in: brandIds } }),
    TeamMember.deleteMany({ brand: { $in: brandIds } }),
    UsageLog.deleteMany({ brand: { $in: brandIds } }),
    UsageRecord.deleteMany({ brand: { $in: brandIds } })
  ]);
  await Brand.deleteMany({ _id: { $in: brandIds } });
  return { brandCount: brandIds.length, mediaCount: mediaRows.length + assetRows.length, storageFailures };
}

async function finalizeAccountDeletion(user) {
  const userId = user._id;
  const identity = deletedIdentity(userId);
  const workspaceResult = await purgeOwnedWorkspaces(userId);
  const now = new Date();

  // Revoke AutoBrand's provider access before removing the connection record.
  // User-owned Google Drive files remain in the user's Drive by design.
  await googleDrive.disconnect(userId).catch((error) => {
    console.warn('[account-deletion] Google Drive revoke failed', { userId: String(userId), message: error.message });
  });

  await Promise.all([
    RefreshToken.deleteMany({ user: userId }),
    PrivilegedLoginChallenge.deleteMany({ user: userId }),
    McpAuthorizationCode.deleteMany({ user: userId }),
    McpRefreshToken.deleteMany({ user: userId }),
    McpOAuthGrant.deleteMany({ user: userId }),
    McpRevokedAccessToken.deleteMany({ user: userId }),
    CloudStorageConnection.deleteMany({ owner: userId }),
    Notification.deleteMany({ user: userId }),
    ApiLog.deleteMany({ user: userId }),
    PublicInquiry.updateMany({ email: String(user.email || '').toLowerCase() }, { $set: { email: identity.email, name: identity.name, 'metadata.accountDeletedAt': now.toISOString() } }),
    CreditLedger.updateMany(
      { $or: [{ user: userId }, { actor: userId }] },
      {
        $unset: { actor: 1, brand: 1, reason: 1, referenceId: 1 },
        $set: { referenceType: 'account_deleted' }
      }
    ),
    TeamMember.updateMany({ user: userId }, {
      $set: { status: 'removed', name: 'Deleted member', email: identity.email, acceptedAt: undefined },
      $unset: { user: 1, inviteTokenHash: 1, inviteExpiresAt: 1 }
    }),
    Subscription.updateMany({ user: userId, status: { $in: ['active', 'trialing', 'pending', 'incomplete', 'past_due'] } }, {
      $set: { status: 'cancelled', cancelledAt: now, endsAt: now, cancelAtPeriodEnd: false, 'metadata.accountDeletedAt': now.toISOString() }
    }),
    Payment.updateMany({ user: userId }, {
      $unset: { 'metadata.email': 1, 'metadata.phone': 1, 'metadata.billingDetails': 1, 'metadata.billing_details': 1, 'metadata.customer': 1 }
    }),
    AuditLog.updateMany({ user: userId }, { $unset: { ipAddress: 1, userAgent: 1, metadata: 1 } })
  ]);

  user.name = identity.name;
  user.email = identity.email;
  user.pendingEmail = undefined;
  user.passwordHash = undefined;
  user.googleId = undefined;
  user.avatar = undefined;
  user.status = 'suspended';
  user.isVerified = false;
  user.selectedPlanSlug = '';
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.accountDeletionStatus = 'completed';
  user.accountDeletionCompletedAt = now;
  user.accountDeletionLeaseUntil = undefined;
  user.accountDeletionError = '';
  user.accountDeletionReason = '';
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  await user.save();
  return workspaceResult;
}

async function claimDueAccount(now = new Date()) {
  return User.findOneAndUpdate({
    accountDeletionScheduledFor: { $lte: now },
    $or: [
      { accountDeletionStatus: 'requested' },
      { accountDeletionStatus: 'processing', accountDeletionLeaseUntil: { $lte: now } }
    ]
  }, {
    $set: {
      accountDeletionStatus: 'processing',
      accountDeletionProcessingAt: now,
      accountDeletionLeaseUntil: new Date(now.getTime() + LEASE_MS),
      accountDeletionError: ''
    },
    $inc: { accountDeletionAttempts: 1 }
  }, { new: true, sort: { accountDeletionScheduledFor: 1 } });
}

async function processDueAccountDeletions({ limit = 10, now = new Date() } = {}) {
  const results = [];
  for (let index = 0; index < Math.max(1, Number(limit || 10)); index += 1) {
    const user = await claimDueAccount(now);
    if (!user) break;
    try {
      const detail = await finalizeAccountDeletion(user);
      results.push({ userId: String(user._id), ok: true, ...detail });
    } catch (error) {
      const attempts = Number(user.accountDeletionAttempts || 1);
      const retryMinutes = Math.min(24 * 60, 5 * (2 ** Math.min(8, Math.max(0, attempts - 1))));
      await User.updateOne({ _id: user._id, accountDeletionStatus: 'processing' }, {
        $set: {
          accountDeletionStatus: 'requested',
          accountDeletionScheduledFor: new Date(Date.now() + retryMinutes * 60000),
          accountDeletionError: String(error.message || error).slice(0, 1000)
        },
        $unset: { accountDeletionLeaseUntil: 1 }
      });
      results.push({ userId: String(user._id), ok: false, error: error.message });
    }
  }
  return results;
}

async function runProcessor() {
  if (running) return;
  running = true;
  try { await processDueAccountDeletions(); }
  catch (error) { console.error('[account-deletion] processor failed', error); }
  finally { running = false; }
}

function startAccountDeletionProcessor() {
  if (timer) return timer;
  timer = setInterval(runProcessor, env.accountDeletionPollMs);
  timer.unref?.();
  setImmediate(runProcessor);
  return timer;
}

function stopAccountDeletionProcessor() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  LEASE_MS,
  claimDueAccount,
  deletedIdentity,
  finalizeAccountDeletion,
  processDueAccountDeletions,
  purgeOwnedWorkspaces,
  removeStoredAsset,
  startAccountDeletionProcessor,
  stopAccountDeletionProcessor
};

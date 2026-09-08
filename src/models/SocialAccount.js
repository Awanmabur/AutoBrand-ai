const mongoose = require('mongoose');

const socialAccountSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform: { type: String, required: true, trim: true, lowercase: true, index: true },
    accountName: { type: String, required: true },
    accountId: { type: String, trim: true },
    accessTokenEncrypted: { type: String },
    refreshTokenEncrypted: { type: String },
    tokenExpiresAt: { type: Date },
    providerMeta: { type: mongoose.Schema.Types.Mixed },
    permissions: [{ type: String }],
    status: { type: String, enum: ['connected', 'expired', 'disconnected', 'needs_reconnect', 'failed', 'mock'], default: 'disconnected', index: true },
    healthStatus: { type: String, enum: ['healthy', 'warning', 'failed', 'unknown'], default: 'unknown', index: true },
    lastSyncAt: { type: Date },
    lastHealthCheckAt: { type: Date },
    disconnectedAt: { type: Date },
    reconnectRequiredAt: { type: Date },
    lastPublishError: { type: String, default: '' }
  },
  { timestamps: true }
);

socialAccountSchema.index({ owner: 1, platform: 1, status: 1 });
socialAccountSchema.index({ brand: 1, platform: 1 });
socialAccountSchema.index(
  { brand: 1, platform: 1, accountId: 1 },
  {
    unique: true,
    name: 'uniq_brand_platform_account',
    partialFilterExpression: { accountId: { $type: 'string', $gt: '' } }
  }
);

module.exports = mongoose.model('SocialAccount', socialAccountSchema);

const mongoose = require('mongoose');

const cloudStorageConnectionSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, enum: ['google_drive'], required: true, index: true },
    status: { type: String, enum: ['connected', 'expired', 'disconnected', 'needs_reconnect', 'failed'], default: 'connected', index: true },
    accountEmail: { type: String, trim: true, lowercase: true, default: '' },
    accountName: { type: String, trim: true, default: '' },
    accessTokenEncrypted: { type: String, default: '' },
    refreshTokenEncrypted: { type: String, default: '' },
    tokenExpiresAt: { type: Date },
    scopes: [{ type: String }],
    rootFolderId: { type: String, trim: true, default: '' },
    rootFolderName: { type: String, trim: true, default: 'AutoBrand AI' },
    lastSyncAt: { type: Date },
    lastError: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

cloudStorageConnectionSchema.index({ owner: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('CloudStorageConnection', cloudStorageConnectionSchema);

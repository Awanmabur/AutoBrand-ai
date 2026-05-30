const mongoose = require('mongoose');

const avatarProfileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    name: { type: String, required: true, trim: true },
    sourceMedia: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
    provider: { type: String, default: 'pending_provider' },
    providerAvatarId: { type: String },
    status: { type: String, enum: ['draft', 'consented', 'training', 'ready', 'failed', 'deleted'], default: 'draft' },
    consentVersion: { type: String, default: '2026-05-16' },
    ownershipConfirmed: { type: Boolean, default: false },
    allowedUse: { type: String, default: 'brand_content' },
    consentedAt: { type: Date },
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AvatarProfile', avatarProfileSchema);

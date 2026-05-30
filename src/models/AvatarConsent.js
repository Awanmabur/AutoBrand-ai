const mongoose = require('mongoose');

const avatarConsentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    avatarProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'AvatarProfile', required: true, index: true },
    consentVersion: { type: String, required: true },
    ownershipConfirmed: { type: Boolean, required: true },
    allowedUse: { type: String, default: 'brand_content' },
    ipAddress: { type: String },
    userAgent: { type: String },
    acceptedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AvatarConsent', avatarConsentSchema);

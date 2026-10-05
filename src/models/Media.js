const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    publicId: { type: String },
    fileType: { type: String, enum: ['image', 'video', 'audio', 'document', 'other'], default: 'other' },
    mimeType: { type: String },
    size: { type: Number, default: 0 },
    folder: { type: String, default: 'local' },
    storageProvider: { type: String, enum: ['platform', 'google_drive', 'both', 'external'], default: 'platform', index: true },
    externalProvider: { type: String, default: '' },
    externalFileId: { type: String, default: '', index: true },
    externalFolderId: { type: String, default: '' },
    externalWebViewLink: { type: String, default: '' },
    publicAccessToken: { type: String, default: '', select: false },
    tags: [{ type: String }],
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    consentRequired: { type: Boolean, default: false },
    consentStatus: { type: String, enum: ['not_required', 'pending', 'accepted', 'revoked'], default: 'not_required' },
    aiPrompt: { type: String },
    aiInsights: {
      summary: String,
      visualPrompt: String,
      contentAngles: [String],
      recommendedPlatforms: [String],
      safetyNotes: [String],
      reuseInstructions: [String],
      generatedFrom: { type: String, default: 'metadata' },
      generatedAt: Date
    },
    variants: [
      {
        kind: String,
        label: String,
        url: String,
        prompt: String,
        status: { type: String, default: 'planned' },
        metadata: mongoose.Schema.Types.Mixed,
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Media', mediaSchema);

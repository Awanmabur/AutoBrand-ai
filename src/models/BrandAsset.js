const mongoose = require('mongoose');

const brandAssetSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    type: {
      type: String,
      enum: ['logo', 'favicon', 'cover', 'image', 'video', 'document', 'font', 'color_palette', 'guideline', 'other'],
      default: 'other',
      index: true
    },
    title: { type: String, trim: true, default: '' },
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    sizeBytes: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true }
  },
  { timestamps: true }
);

brandAssetSchema.index({ brand: 1, type: 1, isDefault: 1 });

module.exports = mongoose.model('BrandAsset', brandAssetSchema);

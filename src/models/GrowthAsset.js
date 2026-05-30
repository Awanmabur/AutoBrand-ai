const mongoose = require('mongoose');

const growthAssetSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    type: {
      type: String,
      enum: ['brand_audit', 'hashtag_pack', 'competitor_snapshot', 'offer_angles'],
      required: true,
      index: true
    },
    title: { type: String, required: true, trim: true },
    summary: { type: String, trim: true },
    sections: [
      {
        heading: String,
        items: [String]
      }
    ],
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

module.exports = mongoose.model('GrowthAsset', growthAssetSchema);

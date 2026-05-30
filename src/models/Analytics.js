const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', index: true },
    platform: { type: String, required: true },
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
    summary: { type: String },
    lastSyncedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Analytics', analyticsSchema);

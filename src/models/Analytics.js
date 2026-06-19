const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', index: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount', index: true },
    platform: { type: String, required: true },
    impressions: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    watchTimeSeconds: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    followersGained: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
    summary: { type: String },
    source: { type: String, enum: ['provider', 'manual', 'mock'], default: 'provider', index: true },
    metricDate: { type: Date, default: Date.now, index: true },
    lastSyncedAt: { type: Date }
  },
  { timestamps: true }
);

analyticsSchema.index({ brand: 1, platform: 1, metricDate: -1 });
analyticsSchema.index({ campaign: 1, metricDate: -1 });
analyticsSchema.index({ post: 1, platform: 1 });

module.exports = mongoose.model('Analytics', analyticsSchema);

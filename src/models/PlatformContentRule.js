const mongoose = require('mongoose');

const platformContentRuleSchema = new mongoose.Schema(
  {
    platform: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    displayName: { type: String, required: true },
    characterLimit: { type: Number, default: 2200 },
    hashtagLimit: { type: Number, default: 30 },
    mediaTypes: [{ type: String }],
    aspectRatios: [{ type: String }],
    maxVideoDurationSeconds: { type: Number, default: 0 },
    supportsFirstComment: { type: Boolean, default: false },
    supportsAltText: { type: Boolean, default: false },
    supportsLinks: { type: Boolean, default: true },
    supportsCarousel: { type: Boolean, default: false },
    supportsStory: { type: Boolean, default: false },
    supportsThumbnail: { type: Boolean, default: false },
    supportsScheduling: { type: Boolean, default: true },
    supportsDirectPublishing: { type: Boolean, default: true },
    recommendedCaptionStyle: { type: String, default: '' },
    recommendedHookStyle: { type: String, default: '' },
    validation: { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformContentRule', platformContentRuleSchema);

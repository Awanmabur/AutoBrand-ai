const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    goal: { type: String, trim: true },
    description: { type: String, trim: true },
    platforms: [{ type: String }],
    startDate: { type: Date },
    endDate: { type: Date },
    postingFrequency: { type: String },
    status: { type: String, enum: ['draft', 'pending_approval', 'approved', 'active', 'paused', 'completed', 'archived', 'rejected', 'changes_requested'], default: 'draft' },
    aiPlan: {
      campaignType: String,
      goalLabel: String,
      strategy: {
        objective: String,
        audience: String,
        positioning: String,
        primaryCta: String,
        keywords: [{ type: String }]
      },
      contentPillars: [{ type: String }],
      suggestedTimes: [{ type: String }],
      postIdeas: [{
        title: String,
        platform: String,
        type: String,
        caption: String,
        hashtags: [{ type: String }],
        contentType: String,
        creativeDirection: String,
        bestTimeHint: String,
        day: Number
      }],
      captions: [{ title: String, platform: String, caption: String, hashtags: [{ type: String }], day: Number }],
      hashtags: [{ type: String }],
      creativeIdeas: [{ title: String, description: String, format: String, platform: String }],
      videoScripts: [{
        platform: String,
        title: String,
        hook: String,
        scenes: [{ order: Number, title: String, narration: String, durationSeconds: Number }],
        cta: String
      }],
      whatsappMessages: [{ title: String, message: String }],
      weeklyPlan: [{ type: mongoose.Schema.Types.Mixed }],
      monthlyPlan: [{ type: mongoose.Schema.Types.Mixed }],
      generatedBundle: { type: mongoose.Schema.Types.Mixed }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Campaign', campaignSchema);

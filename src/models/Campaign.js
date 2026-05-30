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
    status: { type: String, enum: ['draft', 'active', 'paused', 'completed', 'archived'], default: 'draft' },
    aiPlan: {
      contentPillars: [{ type: String }],
      suggestedTimes: [{ type: String }],
      postIdeas: [{ title: String, platform: String, caption: String, day: Number }]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Campaign', campaignSchema);

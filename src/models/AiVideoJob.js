const mongoose = require('mongoose');

const sceneSchema = new mongoose.Schema(
  {
    order: Number,
    title: String,
    visualPrompt: String,
    narration: String,
    durationSeconds: Number,
    status: { type: String, default: 'planned' },
    outputUrl: String
  },
  { _id: false }
);

const aiVideoJobSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    provider: { type: String, default: 'pending_provider' },
    providerJobId: { type: String },
    mode: {
      type: String,
      enum: ['text_to_video', 'brand_to_video', 'campaign_to_video', 'product_to_video', 'image_to_video', 'video_to_video', 'avatar_video'],
      default: 'brand_to_video'
    },
    prompt: { type: String, required: true },
    script: { type: String, default: '' },
    scenePlan: [sceneSchema],
    subtitles: [{ startSeconds: Number, endSeconds: Number, text: String }],
    thumbnailPrompt: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    sourceMedia: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Media' }],
    aspectRatio: { type: String, default: '9:16' },
    durationSeconds: { type: Number, default: 15 },
    status: { type: String, enum: ['queued', 'planning', 'processing', 'generating', 'rendered', 'ready', 'failed', 'cancelled'], default: 'queued' },
    outputUrl: { type: String },
    outputMedia: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
    costCredits: { type: Number, default: 100 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    errorMessage: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AiVideoJob', aiVideoJobSchema);

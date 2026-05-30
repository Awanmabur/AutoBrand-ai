const mongoose = require('mongoose');

const videoRenderSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'VideoTemplate' },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    inputData: { type: mongoose.Schema.Types.Mixed },
    outputUrl: { type: String },
    cloudinaryPublicId: { type: String },
    status: { type: String, enum: ['queued', 'rendering', 'ready', 'failed', 'cancelled'], default: 'queued' },
    costCredits: { type: Number, default: 20 },
    errorMessage: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('VideoRender', videoRenderSchema);

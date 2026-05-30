const mongoose = require('mongoose');

const sceneTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    durationSeconds: { type: Number, default: 5 },
    requiredFields: [{ type: String }],
    layout: { type: String, default: 'text_image_logo' }
  },
  { _id: false }
);

const videoTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    aspectRatio: { type: String, enum: ['9:16', '1:1', '16:9'], default: '9:16' },
    durationSeconds: { type: Number, default: 15 },
    scenes: [sceneTemplateSchema],
    previewUrl: { type: String },
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('VideoTemplate', videoTemplateSchema);

const mongoose = require('mongoose');

const aiProviderConfigSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    taskTypes: [{ type: String, index: true }],
    apiKeyEncrypted: { type: String, default: '' },
    defaultModel: { type: String, default: '' },
    textModel: { type: String, default: '' },
    imageModel: { type: String, default: '' },
    videoModel: { type: String, default: '' },
    audioModel: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    isFallback: { type: Boolean, default: false },
    priority: { type: Number, default: 50, index: true },
    monthlyLimit: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AiProviderConfig', aiProviderConfigSchema);

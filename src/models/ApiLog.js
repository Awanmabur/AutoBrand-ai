const mongoose = require('mongoose');

const apiLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    provider: { type: String, required: true, index: true },
    action: { type: String, required: true },
    status: { type: String, enum: ['success', 'failed', 'skipped'], default: 'success' },
    statusCode: { type: Number },
    durationMs: { type: Number },
    requestId: { type: String },
    message: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApiLog', apiLogSchema);

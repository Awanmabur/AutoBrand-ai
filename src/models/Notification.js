const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String },
    severity: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info', index: true },
    entityType: { type: String },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    actionUrl: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);

const mongoose = require('mongoose');

const approvalSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: ['post', 'campaign'], default: 'post', index: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', index: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewerEmail: { type: String, trim: true, lowercase: true },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publicReviewTokenHash: { type: String, index: true },
    expiresAt: { type: Date, index: true },
    clientName: { type: String, trim: true, default: '' },
    clientEmail: { type: String, trim: true, lowercase: true, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'changes_requested'], default: 'pending', index: true },
    decision: { type: String, enum: ['pending', 'approved', 'rejected', 'changes_requested'], default: 'pending' },
    note: { type: String },
    decisionNote: { type: String, default: '' },
    history: [{
      status: String,
      note: String,
      actorName: String,
      actorEmail: String,
      createdAt: { type: Date, default: Date.now }
    }],
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date }
  },
  { timestamps: true }
);

approvalSchema.index({ reviewerEmail: 1, status: 1 });

module.exports = mongoose.model('Approval', approvalSchema);

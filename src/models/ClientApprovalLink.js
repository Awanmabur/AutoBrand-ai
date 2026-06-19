const mongoose = require('mongoose');

const clientApprovalLinkSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: ['post', 'campaign'], default: 'post', index: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', index: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },
    approval: { type: mongoose.Schema.Types.ObjectId, ref: 'Approval', index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    publicReviewTokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    clientName: { type: String, trim: true, default: '' },
    clientEmail: { type: String, trim: true, lowercase: true, default: '' },
    decision: { type: String, enum: ['pending', 'approved', 'rejected', 'changes_requested', 'expired'], default: 'pending', index: true },
    decisionNote: { type: String, default: '' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    lastViewedAt: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClientApprovalLink', clientApprovalLinkSchema);

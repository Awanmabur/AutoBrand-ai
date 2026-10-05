const mongoose = require('mongoose');

const publicInquirySchema = new mongoose.Schema({
  type: { type: String, enum: ['contact'], required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 320, index: true },
  name: { type: String, trim: true, maxlength: 160, default: '' },
  teamType: { type: String, trim: true, maxlength: 80, default: '' },
  message: { type: String, trim: true, maxlength: 5000, default: '' },
  consentAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['new', 'open', 'resolved'], default: 'new', index: true },
  resolvedAt: { type: Date, default: null },
  requestId: { type: String, maxlength: 128, default: '' },
  source: { type: String, maxlength: 80, default: 'public_site' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

publicInquirySchema.index({ type: 1, email: 1, status: 1 });
publicInquirySchema.index({ createdAt: -1 });

module.exports = mongoose.model('PublicInquiry', publicInquirySchema);

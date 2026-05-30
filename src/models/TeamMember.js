const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, trim: true },
    role: { type: String, enum: ['admin', 'manager', 'content_creator', 'editor', 'reviewer', 'viewer'], default: 'viewer' },
    permissions: [{ type: String }],
    status: { type: String, enum: ['invited', 'active', 'removed'], default: 'invited' },
    inviteTokenHash: { type: String },
    inviteExpiresAt: { type: Date },
    acceptedAt: { type: Date }
  },
  { timestamps: true }
);

teamMemberSchema.index({ brand: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('TeamMember', teamMemberSchema);

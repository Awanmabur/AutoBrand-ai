const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const roles = ['super_admin', 'platform_admin', 'billing_admin', 'ai_manager', 'integration_manager', 'content_moderator', 'support_agent', 'analyst', 'agency_owner', 'brand_owner', 'team_owner', 'content_creator', 'client_reviewer', 'team_member'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String },
    avatar: { type: String },
    role: { type: String, enum: roles, default: 'brand_owner', index: true },
    adminRole: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminRole' },
    permissions: [{ type: String, trim: true }],
    plan: { type: String, default: 'free-trial', index: true },
    selectedPlanSlug: { type: String, default: '' },
    trialUsed: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'pending' },
    lastLoginAt: { type: Date },
    passwordResetTokenHash: { type: String },
    passwordResetExpiresAt: { type: Date },
    emailVerificationTokenHash: { type: String },
    emailVerificationExpiresAt: { type: Date }
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.safeProfile = function safeProfile() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    plan: this.plan,
    status: this.status,
    isVerified: this.isVerified
  };
};

module.exports = mongoose.model('User', userSchema);

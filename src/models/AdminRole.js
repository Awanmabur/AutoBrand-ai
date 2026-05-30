const mongoose = require('mongoose');

const adminRoleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    permissions: [{ type: String, trim: true }],
    isSystem: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminRole', adminRoleSchema);

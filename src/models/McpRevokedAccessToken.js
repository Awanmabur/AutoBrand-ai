const mongoose = require('mongoose');

const mcpRevokedAccessTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true, index: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    clientId: { type: String, trim: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    reason: { type: String, trim: true, maxlength: 120, default: 'oauth_revocation' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('McpRevokedAccessToken', mcpRevokedAccessTokenSchema);

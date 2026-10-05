const mongoose = require('mongoose');

const mcpOAuthGrantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String, required: true, trim: true, index: true },
    scopes: [{ type: String, required: true }],
    authorizedAt: { type: Date, required: true, default: Date.now },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date }
  },
  { timestamps: true }
);

mcpOAuthGrantSchema.index({ user: 1, clientId: 1 }, { unique: true, name: 'uniq_mcp_oauth_grant_user_client' });

module.exports = mongoose.model('McpOAuthGrant', mcpOAuthGrantSchema);

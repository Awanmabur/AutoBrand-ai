const mongoose = require('mongoose');

const mcpRefreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String, required: true, index: true },
    scopes: [{ type: String, required: true }],
    resource: { type: String, required: true },
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: { type: Date },
    rotatedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('McpRefreshToken', mcpRefreshTokenSchema);

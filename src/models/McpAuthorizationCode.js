const mongoose = require('mongoose');

const mcpAuthorizationCodeSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String, required: true, index: true },
    redirectUri: { type: String, required: true },
    scopes: [{ type: String, required: true }],
    resource: { type: String, required: true },
    codeChallenge: { type: String, required: true },
    codeChallengeMethod: { type: String, enum: ['S256'], required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('McpAuthorizationCode', mcpAuthorizationCodeSchema);

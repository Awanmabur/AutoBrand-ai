const mongoose = require('mongoose');

const mcpOAuthClientSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true, index: true, trim: true },
    clientName: { type: String, trim: true, maxlength: 200, default: 'MCP client' },
    redirectUris: [{ type: String, trim: true }],
    grantTypes: [{ type: String, trim: true }],
    responseTypes: [{ type: String, trim: true }],
    tokenEndpointAuthMethod: { type: String, enum: ['none'], default: 'none' },
    source: { type: String, enum: ['dynamic', 'cimd', 'admin'], default: 'dynamic', index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastUsedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('McpOAuthClient', mcpOAuthClientSchema);

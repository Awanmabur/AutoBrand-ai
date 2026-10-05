const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  codeHash: { type: String, required: true, select: false },
  browserNonceHash: { type: String, required: true, select: false },
  nextPath: { type: String, default: '/dashboard', maxlength: 1000 },
  attempts: { type: Number, default: 0, min: 0 },
  maxAttempts: { type: Number, default: 5, min: 1, max: 10 },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null, index: true },
  requestedIpHash: { type: String, default: '', maxlength: 128 },
  requestedUserAgentHash: { type: String, default: '', maxlength: 128 }
}, { timestamps: true });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ user: 1, consumedAt: 1, createdAt: -1 });
module.exports = mongoose.model('PrivilegedLoginChallenge', schema);

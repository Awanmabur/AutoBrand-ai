const mongoose = require('mongoose');

const rateLimitBucketSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    totalHits: { type: Number, required: true, default: 0, min: 0 },
    resetAt: { type: Date, required: true, index: { expires: 0 } }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = mongoose.model('RateLimitBucket', rateLimitBucketSchema);

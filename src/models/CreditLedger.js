const mongoose = require('mongoose');

const creditLedgerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['grant', 'usage', 'refund', 'adjustment'], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reason: { type: String },
    referenceType: { type: String },
    referenceId: { type: mongoose.Schema.Types.ObjectId }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CreditLedger', creditLedgerSchema);

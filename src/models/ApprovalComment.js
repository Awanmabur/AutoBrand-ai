const mongoose = require('mongoose');

const approvalCommentSchema = new mongoose.Schema(
  {
    approval: { type: mongoose.Schema.Types.ObjectId, ref: 'Approval', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String, trim: true },
    body: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApprovalComment', approvalCommentSchema);

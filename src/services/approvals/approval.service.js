const crypto = require('crypto');
const Approval = require('../../models/Approval');
const ClientApprovalLink = require('../../models/ClientApprovalLink');
const { hashToken } = require('../tokenService');

function makeApprovalToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createApprovalLink({ post, approval, createdBy, clientName = '', clientEmail = '', expiresInDays = 7 }) {
  const token = makeApprovalToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + Number(expiresInDays || 7) * 24 * 60 * 60 * 1000);
  const link = await ClientApprovalLink.create({
    post: post._id || post,
    approval: approval?._id || approval,
    brand: post.brand,
    createdBy: createdBy?._id || createdBy,
    publicReviewTokenHash: tokenHash,
    expiresAt,
    clientName,
    clientEmail,
    decision: 'pending'
  });
  if (approval) {
    approval.publicReviewTokenHash = tokenHash;
    approval.expiresAt = expiresAt;
    approval.clientName = clientName || approval.clientName;
    approval.clientEmail = clientEmail || approval.clientEmail;
    await approval.save();
  }
  return { link, token, urlPath: `/approvals/review/${token}` };
}

async function resolveApprovalToken(token) {
  const publicReviewTokenHash = hashToken(token);
  const link = await ClientApprovalLink.findOne({ publicReviewTokenHash }).populate('post approval brand');
  if (!link) return null;
  if (link.expiresAt < new Date()) {
    link.decision = 'expired';
    await link.save();
    const error = new Error('This approval link has expired.');
    error.status = 419;
    throw error;
  }
  link.lastViewedAt = new Date();
  await link.save();
  return link;
}

async function submitDecision({ token, decision, decisionNote = '', resolvedBy }) {
  const link = await resolveApprovalToken(token);
  if (!link) {
    const error = new Error('Approval link not found.');
    error.status = 404;
    throw error;
  }
  link.decision = decision;
  link.decisionNote = decisionNote;
  link.resolvedBy = resolvedBy?._id || resolvedBy;
  link.resolvedAt = new Date();
  await link.save();

  if (link.approval) {
    link.approval.status = decision;
    link.approval.decision = decision;
    link.approval.decisionNote = decisionNote;
    link.approval.resolvedBy = resolvedBy?._id || resolvedBy;
    link.approval.resolvedAt = new Date();
    await link.approval.save();
  }

  if (link.post) {
    link.post.status = decision === 'approved'
      ? (link.post.publishAfterApproval ? 'scheduled' : 'approved')
      : decision === 'rejected'
        ? 'rejected'
        : 'pending_approval';
    link.post.handoffStatus = decision;
    await link.post.save();
  }

  return link;
}

async function requestApproval({ post, requestedBy, reviewerEmail, reviewerName, note, publishAfterApproval = false }) {
  post.approvalRequired = true;
  post.publishAfterApproval = publishAfterApproval;
  post.status = 'pending_approval';
  await post.save();
  const approval = await Approval.create({
    post: post._id,
    requestedBy: requestedBy?._id || requestedBy,
    reviewerEmail,
    clientName: reviewerName || '',
    clientEmail: reviewerEmail,
    note,
    status: 'pending',
    decision: 'pending'
  });
  const link = await createApprovalLink({ post, approval, createdBy: requestedBy, clientName: reviewerName, clientEmail: reviewerEmail });
  return { approval, ...link };
}

module.exports = { createApprovalLink, makeApprovalToken, requestApproval, resolveApprovalToken, submitDecision };

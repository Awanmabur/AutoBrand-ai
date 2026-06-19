const crypto = require('crypto');
const Approval = require('../../models/Approval');
const ClientApprovalLink = require('../../models/ClientApprovalLink');
const { hashToken } = require('../tokenService');

function makeApprovalToken() {
  return crypto.randomBytes(32).toString('hex');
}

function targetBrand(target) {
  return target?.brand?._id || target?.brand;
}

async function createApprovalLink({ post, campaign, approval, createdBy, clientName = '', clientEmail = '', expiresInDays = 7 }) {
  const token = makeApprovalToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + Number(expiresInDays || 7) * 24 * 60 * 60 * 1000);
  const targetType = campaign ? 'campaign' : 'post';
  const target = campaign || post;
  const link = await ClientApprovalLink.create({
    targetType,
    post: post?._id || post,
    campaign: campaign?._id || campaign,
    approval: approval?._id || approval,
    brand: targetBrand(target),
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
  return { link, token, urlPath: `/review/${token}` };
}

async function resolveApprovalToken(token) {
  const publicReviewTokenHash = hashToken(token);
  const link = await ClientApprovalLink.findOne({ publicReviewTokenHash }).populate('post campaign approval brand');
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
    link.approval.history = [
      ...(link.approval.history || []),
      { status: decision, note: decisionNote, actorName: link.clientName || 'Client reviewer', actorEmail: link.clientEmail || '', createdAt: new Date() }
    ];
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
  if (link.campaign) {
    link.campaign.status = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'changes_requested';
    await link.campaign.save();
  }

  return link;
}

async function requestApproval({ post, requestedBy, reviewerEmail, reviewerName, note, publishAfterApproval = false }) {
  post.approvalRequired = true;
  post.publishAfterApproval = publishAfterApproval;
  post.status = 'pending_approval';
  await post.save();
  const approval = await Approval.create({
    targetType: 'post',
    post: post._id,
    requestedBy: requestedBy?._id || requestedBy,
    reviewerEmail,
    clientName: reviewerName || '',
    clientEmail: reviewerEmail,
    note,
    status: 'pending',
    decision: 'pending',
    history: [{ status: 'pending', note, actorName: requestedBy?.name || '', actorEmail: requestedBy?.email || '', createdAt: new Date() }]
  });
  const link = await createApprovalLink({ post, approval, createdBy: requestedBy, clientName: reviewerName, clientEmail: reviewerEmail });
  return { approval, ...link };
}

async function requestCampaignApproval({ campaign, requestedBy, reviewerEmail, reviewerName, note }) {
  campaign.status = 'pending_approval';
  await campaign.save();
  const approval = await Approval.create({
    targetType: 'campaign',
    campaign: campaign._id,
    requestedBy: requestedBy?._id || requestedBy,
    reviewerEmail,
    clientName: reviewerName || '',
    clientEmail: reviewerEmail,
    note,
    status: 'pending',
    decision: 'pending',
    history: [{ status: 'pending', note, actorName: requestedBy?.name || '', actorEmail: requestedBy?.email || '', createdAt: new Date() }]
  });
  const link = await createApprovalLink({ campaign, approval, createdBy: requestedBy, clientName: reviewerName, clientEmail: reviewerEmail });
  return { approval, ...link };
}

module.exports = { createApprovalLink, makeApprovalToken, requestApproval, requestCampaignApproval, resolveApprovalToken, submitDecision };

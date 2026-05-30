const Approval = require('../../models/Approval');
const ClientApprovalLink = require('../../models/ClientApprovalLink');
const { createApprovalLink } = require('../approvals/approval.service');

async function prepareHandoff(post, { assignedTo, reviewerEmail, reviewerName, notes = '', checklist = [], dueDate, requestedBy }) {
  post.workflowMode = 'handoff';
  post.handoffStatus = 'ready';
  post.handoffAssignedTo = assignedTo || post.handoffAssignedTo;
  post.handoffReviewerEmail = reviewerEmail || post.handoffReviewerEmail;
  post.handoffNotes = notes || post.handoffNotes;
  post.handoffChecklist = checklist.length ? checklist.map((label) => (typeof label === 'string' ? { label, done: false } : label)) : post.handoffChecklist;
  post.handoffDueDate = dueDate || post.handoffDueDate;
  post.status = post.approvalRequired ? 'pending_approval' : post.status;
  await post.save();

  let approval = null;
  let link = null;
  if (reviewerEmail) {
    approval = await Approval.create({
      post: post._id,
      requestedBy: requestedBy?._id || requestedBy || post.createdBy,
      reviewerEmail,
      clientName: reviewerName || '',
      clientEmail: reviewerEmail,
      status: 'pending',
      decision: 'pending',
      note: notes
    });
    link = await createApprovalLink({ post, approval, createdBy: requestedBy || post.createdBy, clientName: reviewerName, clientEmail: reviewerEmail });
  }

  return { post, approval, link };
}

async function markHandoffDecision(post, decision, note = '') {
  post.handoffStatus = decision === 'approved' ? 'approved' : decision;
  if (decision === 'approved') post.status = post.publishAfterApproval ? 'scheduled' : 'approved';
  if (decision === 'rejected') post.status = 'rejected';
  if (decision === 'changes_requested') post.status = 'pending_approval';
  post.handoffNotes = [post.handoffNotes, note].filter(Boolean).join('\n');
  await post.save();
  return post;
}

function shouldUseHandoffFallback(error) {
  const message = String(error?.message || '').toLowerCase();
  return /permission|scope|not approved|unsupported|direct publishing|token|expired|rate limit/.test(message);
}

module.exports = { markHandoffDecision, prepareHandoff, shouldUseHandoffFallback };

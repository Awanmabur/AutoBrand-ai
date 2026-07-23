const Approval = require('../models/Approval');
const ApprovalComment = require('../models/ApprovalComment');
const Post = require('../models/Post');
const Campaign = require('../models/Campaign');
const Notification = require('../models/Notification');
const { requestApproval: requestApprovalService, requestCampaignApproval, resolveApprovalToken, submitDecision } = require('../services/approvals/approval.service');
const { assertCanCreateApprovalLink } = require('../services/usageLimitService');
const { dispatchScheduledPost } = require('../services/postDispatchService');


async function notifySafely(payload) {
  try {
    await Notification.create(payload);
  } catch (error) {
    console.warn('[approvals] notification could not be saved', {
      type: payload?.type,
      entityId: payload?.entityId ? String(payload.entityId) : undefined,
      message: error?.message
    });
  }
}

async function index(req, res) {
  return res.redirect(303, '/dashboard/approvals');
}

async function requestApproval(req, res, next) {
  try {
    if (req.body.campaign) {
      const campaign = await Campaign.findOne({ _id: req.body.campaign, createdBy: req.user._id });
      if (!campaign) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
      await assertCanCreateApprovalLink(req.user);

      await requestCampaignApproval({
        campaign,
        requestedBy: req.user,
        reviewerEmail: req.body.reviewerEmail,
        reviewerName: req.body.reviewerName,
        note: req.body.note
      });

      await notifySafely({
        user: req.user._id,
        type: 'approval_requested',
        title: 'Campaign approval requested',
        message: `Approval requested for campaign ${campaign.name}.`,
        entityType: 'Campaign',
        entityId: campaign._id
      });

      return res.redirect('/dashboard/approvals');
    }

    const post = await Post.findOne({ _id: req.body.post, createdBy: req.user._id });
    if (!post) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await assertCanCreateApprovalLink(req.user);

    await requestApprovalService({
      post,
      requestedBy: req.user,
      reviewerEmail: req.body.reviewerEmail,
      reviewerName: req.body.reviewerName,
      note: req.body.note,
      publishAfterApproval: req.body.publishAfterApproval === 'on'
    });

    await notifySafely({
      user: req.user._id,
      type: 'approval_requested',
      title: 'Approval requested',
      message: `Approval requested for ${post.title || post.platform}.`,
      entityType: 'Post',
      entityId: post._id
    });

    res.redirect('/dashboard/approvals');
  } catch (error) {
    next(error);
  }
}

async function resolve(req, res, next) {
  try {
    const approval = await Approval.findOne({ _id: req.params.id, requestedBy: req.user._id }).populate('post campaign');
    if (!approval) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    approval.status = req.body.status;
    approval.decision = req.body.status;
    approval.resolvedAt = new Date();
    approval.note = req.body.note || approval.note;
    approval.decisionNote = req.body.note || approval.decisionNote;
    approval.history = [
      ...(approval.history || []),
      { status: req.body.status, note: req.body.note || req.body.comment || '', actorName: req.user.name, actorEmail: req.user.email, createdAt: new Date() }
    ];
    await approval.save();

    if (approval.post) {
      approval.post.handoffStatus = req.body.status;
      if (req.body.status === 'approved') approval.post.status = approval.post.publishAfterApproval ? 'scheduled' : 'approved';
      if (req.body.status === 'rejected') approval.post.status = 'rejected';
      if (req.body.status === 'changes_requested') approval.post.status = 'draft';
      if (req.body.status === 'approved' && approval.post.publishAfterApproval) {
        approval.post.scheduledAt = approval.post.scheduledAt || new Date();
        approval.post.scheduleVersion = Number(approval.post.scheduleVersion || 0) + 1;
        approval.post.publishingStartedAt = undefined;
        approval.post.publishingAttemptId = '';
      }
      await approval.post.save();
      if (req.body.status === 'approved' && approval.post.publishAfterApproval) await dispatchScheduledPost(approval.post, { userId: approval.post.createdBy || req.user?._id });
    }
    if (approval.campaign) {
      if (req.body.status === 'approved') approval.campaign.status = 'approved';
      if (req.body.status === 'rejected') approval.campaign.status = 'rejected';
      if (req.body.status === 'changes_requested') approval.campaign.status = 'changes_requested';
      await approval.campaign.save();
    }

    if (req.body.comment) {
      await ApprovalComment.create({
        approval: approval._id,
        user: req.user._id,
        authorName: req.user.name,
        body: req.body.comment
      });
    }

    await notifySafely({
      user: approval.requestedBy,
      type: 'approval_resolved',
      title: 'Approval updated',
      message: `${approval.post?.title || approval.campaign?.name || 'Approval'} is now ${approval.status}.`,
      entityType: 'Approval',
      entityId: approval._id
    });

    res.redirect('/dashboard/approvals');
  } catch (error) {
    next(error);
  }
}

async function comment(req, res, next) {
  try {
    const approval = await Approval.findOne({ _id: req.params.id, requestedBy: req.user._id });
    if (!approval) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    await ApprovalComment.create({
      approval: approval._id,
      user: req.user._id,
      authorName: req.user.name,
      body: req.body.comment
    });

    res.redirect('/dashboard/approvals');
  } catch (error) {
    next(error);
  }
}

async function publicReview(req, res, next) {
  try {
    const link = await resolveApprovalToken(req.params.token);
    if (!link) { const error = new Error('Approval link not found.'); error.status = 404; throw error; }
    res.render('approvals/public-review', { title: 'Review content', layout: 'layouts/main', link, token: req.params.token });
  } catch (error) {
    next(error);
  }
}

async function publicDecision(req, res, next) {
  try {
    const link = await submitDecision({ token: req.params.token, decision: req.body.decision, decisionNote: req.body.decisionNote });
    if (link.approval?.requestedBy) {
      await notifySafely({
        user: link.approval.requestedBy,
        type: req.body.decision === 'approved' ? 'approval_approved' : req.body.decision === 'rejected' ? 'approval_rejected' : 'approval_changes_requested',
        title: 'Client review submitted',
        message: `${link.post?.title || link.campaign?.name || 'Approval'} was ${req.body.decision.replace(/_/g, ' ')}.`,
        entityType: 'Approval',
        entityId: link.approval._id
      });
    }
    res.render('approvals/public-thanks', { title: 'Review submitted', layout: 'layouts/main', link });
  } catch (error) {
    next(error);
  }
}

module.exports = { comment, index, publicDecision, publicReview, requestApproval, resolve };

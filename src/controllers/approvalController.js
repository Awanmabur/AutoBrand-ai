const Approval = require('../models/Approval');
const ApprovalComment = require('../models/ApprovalComment');
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const { requestApproval: requestApprovalService, resolveApprovalToken, submitDecision } = require('../services/approvals/approval.service');

async function index(req, res, next) {
  try {
    const [approvals, draftPosts] = await Promise.all([
      Approval.find({ requestedBy: req.user._id }).populate({ path: 'post', populate: 'brand' }).sort({ createdAt: -1 }),
      Post.find({ createdBy: req.user._id, status: { $in: ['draft', 'pending_approval', 'rejected'] } }).populate('brand').sort({ createdAt: -1 })
    ]);

    const comments = await ApprovalComment.find({ approval: { $in: approvals.map((approval) => approval._id) } }).sort({ createdAt: 1 });
    const commentsByApproval = comments.reduce((acc, comment) => {
      const key = comment.approval.toString();
      acc[key] = acc[key] || [];
      acc[key].push(comment);
      return acc;
    }, {});

    res.render('approvals/index', { title: 'Approvals', layout: 'layouts/dashboard', approvals, draftPosts, commentsByApproval, error: null });
  } catch (error) {
    next(error);
  }
}

async function requestApproval(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.body.post, createdBy: req.user._id });
    if (!post) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    await requestApprovalService({
      post,
      requestedBy: req.user,
      reviewerEmail: req.body.reviewerEmail,
      reviewerName: req.body.reviewerName,
      note: req.body.note,
      publishAfterApproval: req.body.publishAfterApproval === 'on'
    });

    await Notification.create({
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
    const approval = await Approval.findOne({ _id: req.params.id, requestedBy: req.user._id }).populate('post');
    if (!approval) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    approval.status = req.body.status;
    approval.resolvedAt = new Date();
    approval.note = req.body.note || approval.note;
    await approval.save();

    if (req.body.status === 'approved') approval.post.status = 'approved';
    if (req.body.status === 'rejected') approval.post.status = 'rejected';
    if (req.body.status === 'changes_requested') approval.post.status = 'draft';
    await approval.post.save();

    if (req.body.comment) {
      await ApprovalComment.create({
        approval: approval._id,
        user: req.user._id,
        authorName: req.user.name,
        body: req.body.comment
      });
    }

    await Notification.create({
      user: approval.requestedBy,
      type: 'approval_resolved',
      title: 'Approval updated',
      message: `${approval.post.title || approval.post.platform} is now ${approval.status}.`,
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
    if (!approval) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

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
    res.render('approvals/public-thanks', { title: 'Review submitted', layout: 'layouts/main', link });
  } catch (error) {
    next(error);
  }
}

module.exports = { comment, index, publicDecision, publicReview, requestApproval, resolve };

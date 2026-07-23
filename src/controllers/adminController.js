const User = require('../models/User');
const Brand = require('../models/Brand');
const Post = require('../models/Post');
const AiVideoJob = require('../models/AiVideoJob');
const SocialAccount = require('../models/SocialAccount');
const AuditLog = require('../models/AuditLog');
const ApiLog = require('../models/ApiLog');
const Payment = require('../models/Payment');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const { dispatchScheduledPost } = require('../services/postDispatchService');
const { activatePlanForUser } = require('../services/subscription.service');

async function index(req, res) {
  return res.redirect(303, '/dashboard/admin');
}

async function updateUserPlan(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await activatePlanForUser(user, req.body.plan, {
      paymentProvider: 'admin',
      metadata: { changedBy: req.user._id, source: 'admin_console' }
    });
    await AuditLog.create({
      user: req.user._id,
      action: 'admin_user_plan_update',
      entityType: 'User',
      entityId: user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { plan: req.body.plan }
    });
    res.redirect('/dashboard/admin');
  } catch (error) {
    next(error);
  }
}

async function updateUserStatus(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    user.status = req.body.status;
    await user.save();
    await AuditLog.create({
      user: req.user._id,
      action: 'admin_user_status_update',
      entityType: 'User',
      entityId: user._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { status: user.status }
    });

    res.redirect('/dashboard/admin');
  } catch (error) {
    next(error);
  }
}

async function retryPost(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    post.status = 'scheduled';
    post.retryCount = Number(post.retryCount || 0) + 1;
    post.errorMessage = undefined;
    post.scheduledAt = new Date();
    post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
    post.publishingStartedAt = undefined;
    post.publishingAttemptId = '';
    await post.save();
    await dispatchScheduledPost(post, { userId: post.createdBy || req.user?._id });
    await AuditLog.create({
      user: req.user._id,
      action: 'admin_retry_post',
      entityType: 'Post',
      entityId: post._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.redirect('/dashboard/admin');
  } catch (error) {
    next(error);
  }
}

async function retryJob(req, res, next) {
  try {
    const job = await AiVideoJob.findById(req.params.id);
    if (!job) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    job.status = 'queued';
    job.errorMessage = '';
    job.metadata = {
      ...(job.metadata || {}),
      adminRetry: {
        by: req.user._id,
        at: new Date()
      }
    };
    await job.save();
    await AuditLog.create({
      user: req.user._id,
      action: 'admin_retry_ai_video_job',
      entityType: 'AiVideoJob',
      entityId: job._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.redirect('/dashboard/admin');
  } catch (error) {
    next(error);
  }
}

module.exports = { index, retryJob, retryPost, updateUserPlan, updateUserStatus };

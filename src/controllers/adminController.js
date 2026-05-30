const User = require('../models/User');
const Brand = require('../models/Brand');
const Post = require('../models/Post');
const AiVideoJob = require('../models/AiVideoJob');
const SocialAccount = require('../models/SocialAccount');
const AuditLog = require('../models/AuditLog');
const ApiLog = require('../models/ApiLog');
const Payment = require('../models/Payment');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const { enqueuePost } = require('../services/schedulerService');
const { activatePlanForUser } = require('../services/subscription.service');
const { markManualPaymentPaid } = require('../services/billing.service');

async function index(req, res, next) {
  try {
    const [userCount, brandCount, postCount, failedPostCount, videoJobCount, socialCount, recentUsers, failedPosts, auditLogs, apiLogs, payments, plans] = await Promise.all([
      User.countDocuments(),
      Brand.countDocuments(),
      Post.countDocuments(),
      Post.countDocuments({ status: 'failed' }),
      AiVideoJob.countDocuments(),
      SocialAccount.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(8),
      Post.find({ status: 'failed' }).populate('brand').sort({ updatedAt: -1 }).limit(10),
      AuditLog.find().populate('user').sort({ createdAt: -1 }).limit(8)
      ,
      ApiLog.find().populate('user').sort({ createdAt: -1 }).limit(10),
      Payment.find().populate('user').sort({ createdAt: -1 }).limit(10),
      SubscriptionPlan.find({ deletedAt: { $exists: false }, isActive: true }).sort({ sortOrder: 1, price: 1 }).limit(50)
    ]);

    res.render('admin/index', {
      title: 'Admin',
      layout: 'layouts/dashboard',
      stats: { userCount, brandCount, postCount, failedPostCount, videoJobCount, socialCount },
      recentUsers,
      failedPosts,
      auditLogs,
      apiLogs,
      payments,
      plans
    });
  } catch (error) {
    next(error);
  }
}

async function updateUserPlan(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });
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

async function markPaymentPaid(req, res, next) {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });
    await markManualPaymentPaid(payment);
    await AuditLog.create({
      user: req.user._id,
      action: 'admin_payment_mark_paid',
      entityType: 'Payment',
      entityId: payment._id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { reference: payment.reference, plan: payment.metadata?.plan }
    });
    res.redirect('/dashboard/admin');
  } catch (error) {
    next(error);
  }
}

async function updateUserStatus(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

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
    if (!post) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    post.status = 'publishing';
    post.retryCount += 1;
    post.errorMessage = undefined;
    post.scheduledAt = new Date();
    await post.save();
    await enqueuePost(post);
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

module.exports = { index, markPaymentPaid, retryPost, updateUserPlan, updateUserStatus };

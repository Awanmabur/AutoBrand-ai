const Notification = require('../models/Notification');

async function index(req, res, next) {
  try {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(80);
    res.render('notifications/index', { title: 'Notifications', layout: 'layouts/dashboard', notifications });
  } catch (error) {
    next(error);
  }
}

async function markAllRead(req, res, next) {
  try {
    await Notification.updateMany({ user: req.user._id, readAt: null }, { readAt: new Date() });
    res.redirect('/dashboard/notifications');
  } catch (error) {
    next(error);
  }
}

module.exports = { index, markAllRead };

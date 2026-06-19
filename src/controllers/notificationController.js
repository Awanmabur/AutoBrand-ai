const Notification = require('../models/Notification');

async function index(req, res) {
  return res.redirect(303, '/dashboard/notifications');
}

async function markAllRead(req, res, next) {
  try {
    await Notification.updateMany({ user: req.user._id, readAt: null }, { readAt: new Date() });
    res.redirect('/dashboard/notifications');
  } catch (error) {
    next(error);
  }
}

async function markRead(req, res, next) {
  try {
    await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { readAt: new Date() });
    res.redirect('/dashboard/notifications');
  } catch (error) {
    next(error);
  }
}

module.exports = { index, markAllRead, markRead };

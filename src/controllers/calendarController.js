const Post = require('../models/Post');
const Brand = require('../models/Brand');

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function yyyyMmDd(date) {
  return date.toISOString().slice(0, 10);
}

function monthLabel(date) {
  return date.toLocaleDateString('en', { month: 'long', year: 'numeric' });
}

function buildCalendarDays(monthDate, posts) {
  const first = startOfMonth(monthDate);
  const last = endOfMonth(monthDate);
  const gridStart = addDays(first, -first.getDay());
  const gridEnd = addDays(last, 6 - last.getDay());
  const postMap = new Map();

  posts.forEach((post) => {
    const when = post.scheduledAt || post.publishedAt || post.createdAt;
    if (!when) return;
    const key = yyyyMmDd(new Date(when));
    if (!postMap.has(key)) postMap.set(key, []);
    postMap.get(key).push(post);
  });

  const days = [];
  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    const key = yyyyMmDd(cursor);
    days.push({
      key,
      date: new Date(cursor),
      dayNumber: cursor.getDate(),
      inMonth: cursor.getMonth() === monthDate.getMonth(),
      isToday: key === yyyyMmDd(new Date()),
      posts: postMap.get(key) || []
    });
  }
  return days;
}

async function index(req, res, next) {
  try {
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(`/dashboard/calendar${query}`);
  } catch (error) {
    next(error);
  }
}

module.exports = { index };

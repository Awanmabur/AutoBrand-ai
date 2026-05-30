const UsageRecord = require('../models/UsageRecord');
const { getCurrentPlan } = require('./subscription.service');

function monthWindow(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
  return { start, end };
}

async function recordUsage({ user, brand, metric, quantity = 1, taskType, provider, model, tokensUsed = 0, mediaCount = 0, costEstimate = 0, metadata = {} }) {
  const plan = user ? await getCurrentPlan(user) : null;
  return UsageRecord.create({
    user: user?._id || user,
    brand: brand?._id || brand,
    plan: plan?._id,
    planSlug: plan?.slug || user?.plan,
    metric,
    quantity,
    taskType,
    provider,
    model,
    tokensUsed,
    mediaCount,
    costEstimate,
    metadata
  });
}

async function getMonthlyUsage(user, metrics = []) {
  const { start, end } = monthWindow();
  const match = { user: user._id || user, createdAt: { $gte: start, $lt: end } };
  if (metrics.length) match.metric = { $in: metrics };
  const rows = await UsageRecord.aggregate([
    { $match: match },
    { $group: { _id: '$metric', quantity: { $sum: '$quantity' }, tokens: { $sum: '$tokensUsed' }, media: { $sum: '$mediaCount' }, cost: { $sum: '$costEstimate' } } }
  ]);
  return rows.reduce((map, row) => {
    map[row._id] = { quantity: row.quantity, tokens: row.tokens, media: row.media, cost: row.cost };
    return map;
  }, {});
}

async function buildUsageDashboard(user) {
  const [plan, usage] = await Promise.all([getCurrentPlan(user), getMonthlyUsage(user)]);
  const limits = plan?.limits || {};
  const cards = Object.entries(limits).map(([limitName, limit]) => {
    const metric = limitName.replace(/^max/, '').replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, '');
    const used = usage[metric]?.quantity || 0;
    const unlimited = user.role === 'super_admin' || Number(limit) < 0;
    const percent = unlimited ? 0 : Number(limit || 0) ? Math.min(100, Math.round((used / Number(limit)) * 100)) : 100;
    return { limitName, metric, limit, used, percent, unlimited, warn: !unlimited && percent >= 80 };
  });
  return { plan, usage, cards };
}

module.exports = { buildUsageDashboard, getMonthlyUsage, monthWindow, recordUsage };

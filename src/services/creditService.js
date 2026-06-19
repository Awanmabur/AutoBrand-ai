const CreditLedger = require('../models/CreditLedger');
const { notifyLowCredits } = require('./notification.service');

const starterBalances = {
  free: 20,
  starter: 250,
  pro: 1000,
  agency: 5000,
  enterprise: 10000
};

async function getBalance(user) {
  const latest = await CreditLedger.findOne({ user: user._id }).sort({ createdAt: -1 });
  if (latest) return latest.balanceAfter;

  const opening = starterBalances[user.plan] || starterBalances.free;
  await CreditLedger.create({
    user: user._id,
    type: 'grant',
    amount: opening,
    balanceAfter: opening,
    reason: 'Opening plan credits'
  });
  return opening;
}

async function spendCredits({ user, amount, reason, referenceType, referenceId }) {
  const balance = await getBalance(user);
  if (balance < amount) {
    const error = new Error('Not enough credits.');
    error.status = 402;
    throw error;
  }

  const balanceAfter = balance - amount;
  await CreditLedger.create({
    user: user._id,
    type: 'usage',
    amount: -amount,
    balanceAfter,
    reason,
    referenceType,
    referenceId
  });
  await notifyLowCredits({ user, balance: balanceAfter });

  return balanceAfter;
}

module.exports = { getBalance, spendCredits };

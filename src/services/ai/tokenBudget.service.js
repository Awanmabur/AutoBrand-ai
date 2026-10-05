const crypto = require('crypto');
const mongoose = require('mongoose');
const Subscription = require('../../models/Subscription');
const { getCurrentSubscription, getCurrentPlan } = require('../subscription.service');
const { resolveBillingUser } = require('../usageLimitService');

function estimateTokens(text = '') {
  const raw = Math.max(1, Math.ceil(String(text || '').length / 4));
  return Math.ceil(raw * 1.25);
}

// Reservation is intentionally conservative. UTF-8 byte length is a safe upper
// bound for ordinary BPE-style provider tokenizers, while the fixed framing
// allowance covers message/schema wrapper tokens that are not present in the
// visible prompt text. Actual provider usage is reconciled after completion.
function reservationInputUpperBound(text = '') {
  const visibleBytes = Math.max(1, Buffer.byteLength(String(text || ''), 'utf8'));
  return visibleBytes + 512;
}

function extractActualTokenUsage(result = {}) {
  const raw = result?.raw || result || {};
  const usage = raw.usage || raw.usageMetadata || result.usage || {};
  const input = Number(
    usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount ?? usage.inputTokens ?? 0
  );
  const output = Number(
    usage.output_tokens ?? usage.completion_tokens ?? usage.candidatesTokenCount ?? usage.outputTokens ?? 0
  );
  const total = Number(
    usage.total_tokens ?? usage.totalTokenCount ?? usage.totalTokens ?? (input + output)
  );
  if (Number.isFinite(total) && total > 0) {
    return {
      inputTokens: Number.isFinite(input) ? input : 0,
      outputTokens: Number.isFinite(output) ? output : 0,
      totalTokens: total,
      source: 'provider'
    };
  }
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, source: 'unavailable' };
}

function defaultMaxOutputTokens(taskType = 'text_generation') {
  const task = String(taskType || 'text_generation');
  if (task.includes('calendar')) return 6000;
  if (task.includes('campaign')) return 4000;
  if (task.includes('script')) return 2500;
  if (task.includes('analytics')) return 2200;
  if (task.includes('caption') || task.includes('hashtag') || task.includes('reply')) return 1200;
  return 2000;
}


async function cleanupExpiredReservations(subscriptionId, now = new Date()) {
  if (!subscriptionId) return;
  await Subscription.updateOne(
    { _id: subscriptionId },
    [
      {
        $set: {
          aiTokenReservations: {
            $filter: {
              input: { $ifNull: ['$aiTokenReservations', []] },
              as: 'reservation',
              cond: { $gt: ['$$reservation.expiresAt', now] }
            }
          }
        }
      },
      {
        $set: {
          aiTokensReserved: {
            $sum: {
              $map: {
                input: { $ifNull: ['$aiTokenReservations', []] },
                as: 'reservation',
                in: { $ifNull: ['$$reservation.tokens', 0] }
              }
            }
          }
        }
      }
    ]
  );
}

async function reserveTokenBudget({ user, brandId, inputText = '', maxOutputTokens, attemptMultiplier = 1 }) {
  const billingUser = brandId ? await resolveBillingUser(user, brandId) : user;
  if (!billingUser?._id) throw new Error('Billing workspace is unavailable.');
  if (billingUser.role === 'super_admin') {
    return { unlimited: true, billingUser, reservation: 0, maxOutputTokens: Number(maxOutputTokens || 2000), limit: -1 };
  }

  const [subscription, plan] = await Promise.all([
    getCurrentSubscription(billingUser),
    getCurrentPlan(billingUser)
  ]);
  if (!subscription || !plan) {
    const error = new Error('An active subscription is required for AI generation.');
    error.status = 402;
    throw error;
  }

  const limit = Number(plan?.aiConfig?.monthlyTokenLimit || 0);
  if (limit < 0) return { unlimited: true, billingUser, subscription, plan, reservation: 0, maxOutputTokens: Number(maxOutputTokens || 2000), limit };
  if (limit <= 0) {
    const error = new Error('The active plan does not include AutoBrand AI token usage.');
    error.status = 402;
    error.limitName = 'monthlyTokenLimit';
    error.limit = 0;
    throw error;
  }

  const outputCap = Math.max(1, Math.floor(Number(maxOutputTokens || 2000)));
  const multiplier = Math.max(1, Math.floor(Number(attemptMultiplier || 1)));
  const reservation = Math.max(1, (reservationInputUpperBound(inputText) + outputCap) * multiplier);

  const reservationId = crypto.randomUUID();
  const reservationExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await cleanupExpiredReservations(subscription._id);

  await Subscription.updateOne(
    { _id: subscription._id, aiTokensUsed: mongoose.trusted({ $exists: false }) },
    { $set: { aiTokensUsed: 0 } }
  ).catch(() => {});
  await Subscription.updateOne(
    { _id: subscription._id, aiTokensReserved: mongoose.trusted({ $exists: false }) },
    { $set: { aiTokensReserved: 0 } }
  ).catch(() => {});

  await Subscription.updateOne(
    { _id: subscription._id, aiTokenReservations: mongoose.trusted({ $exists: false }) },
    { $set: { aiTokenReservations: [] } }
  ).catch(() => {});

  const updated = await Subscription.findOneAndUpdate(
    {
      _id: subscription._id,
      status: mongoose.trusted({ $in: ['active', 'trialing'] }),
      $expr: mongoose.trusted({
        $lte: [
          {
            $add: [
              { $ifNull: ['$aiTokensUsed', 0] },
              { $ifNull: ['$aiTokensReserved', 0] },
              reservation
            ]
          },
          limit
        ]
      })
    },
    { $inc: { aiTokensReserved: reservation }, $push: { aiTokenReservations: { reservationId, tokens: reservation, createdAt: new Date(), expiresAt: reservationExpiresAt } } },
    { new: true }
  );

  if (!updated) {
    const fresh = await Subscription.findById(subscription._id).select('aiTokensUsed aiTokensReserved').lean();
    const used = Number(fresh?.aiTokensUsed || 0);
    const reserved = Number(fresh?.aiTokensReserved || 0);
    const error = new Error(`AI token allowance reached for this subscription period (${used} used + ${reserved} reserved / ${limit}).`);
    error.status = 402;
    error.limitName = 'monthlyTokenLimit';
    error.limit = limit;
    error.used = used;
    error.reserved = reserved;
    throw error;
  }

  return { unlimited: false, billingUser, subscription: updated, plan, reservation, reservationId, reservationExpiresAt, maxOutputTokens: outputCap, limit };
}

async function releaseTokenReservation(context) {
  if (!context || context.unlimited || !context.subscription?._id || !context.reservationId) return;
  await Subscription.updateOne(
    { _id: context.subscription._id },
    [
      {
        $set: {
          aiTokenReservations: {
            $filter: {
              input: { $ifNull: ['$aiTokenReservations', []] },
              as: 'reservation',
              cond: { $ne: ['$$reservation.reservationId', context.reservationId] }
            }
          }
        }
      },
      {
        $set: {
          aiTokensReserved: {
            $sum: {
              $map: {
                input: { $ifNull: ['$aiTokenReservations', []] },
                as: 'reservation',
                in: { $ifNull: ['$$reservation.tokens', 0] }
              }
            }
          }
        }
      }
    ]
  );
}

async function settleTokenBudget(context, { actualTokens = 0, fallbackTokens = 0 } = {}) {
  if (!context || context.unlimited || !context.subscription?._id) return { used: Number(actualTokens || 0), limit: context?.limit ?? -1 };
  const consumed = Math.max(0, Math.ceil(Number(actualTokens || fallbackTokens || 0)));
  const updated = await Subscription.findOneAndUpdate(
    { _id: context.subscription._id },
    [
      {
        $set: {
          aiTokensUsed: { $add: [{ $ifNull: ['$aiTokensUsed', 0] }, consumed] },
          aiTokenReservations: {
            $filter: {
              input: { $ifNull: ['$aiTokenReservations', []] },
              as: 'reservation',
              cond: { $ne: ['$$reservation.reservationId', context.reservationId] }
            }
          }
        }
      },
      {
        $set: {
          aiTokensReserved: {
            $sum: {
              $map: {
                input: { $ifNull: ['$aiTokenReservations', []] },
                as: 'reservation',
                in: { $ifNull: ['$$reservation.tokens', 0] }
              }
            }
          }
        }
      }
    ],
    { new: true }
  ).select('aiTokensUsed aiTokensReserved');
  return { used: consumed, totalUsed: Number(updated?.aiTokensUsed || 0), reserved: Math.max(0, Number(updated?.aiTokensReserved || 0)), limit: context.limit };
}

module.exports = {
  cleanupExpiredReservations,
  defaultMaxOutputTokens,
  estimateTokens,
  reservationInputUpperBound,
  extractActualTokenUsage,
  releaseTokenReservation,
  reserveTokenBudget,
  settleTokenBudget
};

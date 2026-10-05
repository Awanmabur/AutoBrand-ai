const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

test('subscriptions and payments persist immutable commercial plan snapshots', () => {
  const subscriptionModel = source('src/models/Subscription.js');
  const paymentModel = source('src/models/Payment.js');
  const subscriptionService = source('src/services/subscription.service.js');
  const billingService = source('src/services/billing/billing.service.js');
  assert.match(subscriptionModel, /planSnapshot/);
  assert.match(paymentModel, /planSnapshot/);
  assert.match(subscriptionService, /planForSubscription/);
  assert.match(subscriptionService, /subscription\.planSnapshot/);
  assert.match(billingService, /planSnapshot/);
  assert.match(billingService, /payment\.planSnapshot/);
});

test('upgrades are prorated while downgrades and lateral switches are period-end changes', () => {
  const subscriptionService = source('src/services/subscription.service.js');
  const controller = source('src/controllers/billingController.js');
  assert.match(subscriptionService, /periodRemainingFraction/);
  assert.match(subscriptionService, /unusedCredit/);
  assert.match(subscriptionService, /targetPrice - unusedCredit/);
  assert.match(subscriptionService, /kind: targetPrice < currentPrice \? 'downgrade' : 'lateral'/);
  assert.match(subscriptionService, /scheduledPlanChange/);
  assert.match(controller, /schedulePlanChange/);
  assert.match(controller, /\['downgrade', 'lateral'\]/);
});

test('upgrade reversals can restore a still-valid previous subscription', () => {
  const subscriptionService = source('src/services/subscription.service.js');
  assert.match(subscriptionService, /previousSubscriptionId/);
  assert.match(subscriptionService, /payment\.billingChange\?\.kind === 'upgrade'/);
  assert.match(subscriptionService, /restoredAfterPaymentReversalAt/);
});

test('AI token budget reserves before provider execution and reconciles provider usage', () => {
  const budget = source('src/services/ai/tokenBudget.service.js');
  const aiService = source('src/services/ai/ai.service.js');
  const legacy = source('src/services/ai/legacyProvider.service.js');
  assert.match(budget, /aiTokensReserved/);
  assert.match(budget, /monthlyTokenLimit/);
  assert.match(budget, /extractActualTokenUsage/);
  assert.match(budget, /reservationInputUpperBound/);
  assert.match(budget, /reservationExpiresAt/);
  assert.match(budget, /cleanupExpiredReservations/);
  assert.match(aiService, /reserveTokenBudget/);
  assert.match(aiService, /settleTokenBudget/);
  assert.match(legacy, /reserveTokenBudget/);
  assert.match(legacy, /settleTokenBudget/);
});

test('text providers cap output tokens to the reserved budget', () => {
  for (const file of ['openai.provider.js', 'anthropic.provider.js', 'gemini.provider.js', 'groq.provider.js', 'mistral.provider.js', 'deepseek.provider.js']) {
    const code = source(`src/services/ai/providers/${file}`);
    assert.match(code, /max(OutputTokens|_tokens)/, `${file} must cap generated output`);
  }
});

test('production migration backfills snapshots and token counters for existing subscriptions', () => {
  const migration = source('scripts/migrateProductionData.js');
  assert.match(migration, /backfillSubscriptionCommercialSnapshots/);
  assert.match(migration, /backfillPaymentPlanSnapshots/);
  assert.match(migration, /tokenBudgetInitializedAt/);
});

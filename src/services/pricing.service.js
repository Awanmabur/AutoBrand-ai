const { listPublicPlans } = require('./subscription.service');
const { decoratePlanForDisplay } = require('./planDisplay.service');

async function getPublicPricingCards() {
  const plans = await listPublicPlans();
  return plans.map(decoratePlanForDisplay);
}

module.exports = { getPublicPricingCards };

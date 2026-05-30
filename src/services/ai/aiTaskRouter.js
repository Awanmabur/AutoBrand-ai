const AiProviderConfig = require('../../models/AiProviderConfig');
const PlanAiConfig = require('../../models/PlanAiConfig');
const { getCurrentPlan } = require('../subscription.service');
const { isModelAllowed, taskGroup } = require('./aiModelRegistry.service');

function providerFieldForTask(taskType) {
  const group = taskGroup(taskType);
  if (group === 'image') return ['defaultImageProvider', 'defaultImageModel'];
  if (group === 'video') return ['defaultVideoProvider', 'defaultVideoModel'];
  return ['defaultTextProvider', 'defaultTextModel'];
}

async function resolvePlanAiConfig({ user, plan, taskType }) {
  const activePlan = plan || await getCurrentPlan(user || {});
  if (activePlan?._id) {
    const config = await PlanAiConfig.findOne({ plan: activePlan._id, taskType, isActive: true });
    if (config) return { plan: activePlan, config };
  }
  return { plan: activePlan, config: null };
}

async function chooseProvider({ user, plan, taskType = 'text_generation', requestedProvider, requestedModel }) {
  const { plan: activePlan, config } = await resolvePlanAiConfig({ user, plan, taskType });
  const [providerField, modelField] = providerFieldForTask(taskType);
  const planAi = activePlan?.aiConfig || {};
  const allowedProviders = config?.allowedProviders?.length ? config.allowedProviders : planAi.allowedProviders || ['local'];
  const allowedModels = config?.allowedModels?.length ? config.allowedModels : planAi.allowedModels || ['*'];
  const allowSelection = user?.role === 'super_admin' || config?.allowUserSelection || planAi.allowUserProviderSelection;

  let provider = allowSelection && requestedProvider ? requestedProvider : config?.primaryProvider || planAi[providerField] || 'local';
  let model = allowSelection && requestedModel ? requestedModel : config?.primaryModel || planAi[modelField] || 'local-fast';

  if (!allowedProviders.includes('*') && !allowedProviders.includes(provider)) {
    provider = config?.primaryProvider || allowedProviders[0] || 'local';
  }
  if (!isModelAllowed({ provider, model, allowedModels, taskType })) {
    model = config?.primaryModel || allowedModels.find((item) => item !== '*') || 'local-fast';
  }

  const providerConfig = await AiProviderConfig.findOne({ slug: provider, isActive: true });
  return {
    provider,
    model,
    fallbackProvider: config?.fallbackProvider || planAi.fallbackProvider || 'local',
    fallbackModel: config?.fallbackModel || planAi.fallbackModel || 'local-fallback',
    priority: config?.queuePriority || activePlan?.queuePriority || 5,
    providerConfig,
    plan: activePlan
  };
}

module.exports = { chooseProvider, providerFieldForTask, resolvePlanAiConfig };

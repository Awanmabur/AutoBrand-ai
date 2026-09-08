const AiProviderConfig = require('../../models/AiProviderConfig');
const PlanAiConfig = require('../../models/PlanAiConfig');
const { getCurrentPlan } = require('../subscription.service');
const { isModelAllowed, taskGroup, DEFAULT_MODEL_REGISTRY } = require('./aiModelRegistry.service');

function providerFieldForTask(taskType) {
  const group = taskGroup(taskType);
  if (group === 'image') return ['defaultImageProvider', 'defaultImageModel'];
  if (group === 'video') return ['defaultVideoProvider', 'defaultVideoModel'];
  return ['defaultTextProvider', 'defaultTextModel'];
}

function routeError(message, status = 422) {
  const error = new Error(message);
  error.status = status;
  error.safeMessage = message;
  return error;
}

function normalizedList(values) {
  return Array.isArray(values) ? values.map((value) => String(value || '').trim()).filter(Boolean) : [];
}

function providerSupportsTask(provider, taskType) {
  const group = taskGroup(taskType);
  return Boolean(DEFAULT_MODEL_REGISTRY[String(provider || '').toLowerCase()]?.[group]?.length);
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
  const allowedProviders = normalizedList(config?.allowedProviders?.length ? config.allowedProviders : planAi.allowedProviders);
  const allowedModels = normalizedList(config?.allowedModels?.length ? config.allowedModels : planAi.allowedModels);
  const allowSelection = user?.role === 'super_admin' || config?.allowUserSelection || planAi.allowUserProviderSelection;

  if (!allowedProviders.length) {
    throw routeError('This plan has no generative AI provider enabled for this task.', 402);
  }

  let provider = String(
    allowSelection && requestedProvider
      ? requestedProvider
      : config?.primaryProvider || planAi[providerField] || ''
  ).trim().toLowerCase();

  if (!provider) {
    provider = allowedProviders.includes('*') ? '' : String(allowedProviders[0] || '').toLowerCase();
  }
  if (!provider) throw routeError('No AI provider is configured for this task.', 503);
  if (!allowedProviders.includes('*') && !allowedProviders.includes(provider)) {
    throw routeError(`AI provider ${provider} is not allowed by the active plan.`, 403);
  }
  if (!providerSupportsTask(provider, taskType)) {
    throw routeError(`AI provider ${provider} does not support ${taskGroup(taskType)} generation.`, 422);
  }

  let model = String(
    allowSelection && requestedModel
      ? requestedModel
      : config?.primaryModel || planAi[modelField] || ''
  ).trim();
  if (!model) {
    const registered = DEFAULT_MODEL_REGISTRY[provider]?.[taskGroup(taskType)] || [];
    model = allowedModels.includes('*') ? registered[0] || '' : allowedModels.find((item) => registered.includes(item)) || registered[0] || '';
  }
  if (!model) throw routeError(`No AI model is configured for ${provider} ${taskGroup(taskType)} generation.`, 503);
  if (!isModelAllowed({ provider, model, allowedModels, taskType })) {
    throw routeError(`AI model ${model} is not allowed by the active plan.`, 403);
  }

  const fallbackProvider = String(config?.fallbackProvider || planAi.fallbackProvider || '').trim().toLowerCase();
  const fallbackModel = String(config?.fallbackModel || planAi.fallbackModel || '').trim();
  if (fallbackProvider) {
    if (!allowedProviders.includes('*') && !allowedProviders.includes(fallbackProvider)) {
      throw routeError(`Fallback AI provider ${fallbackProvider} is not allowed by the active plan.`, 422);
    }
    if (!providerSupportsTask(fallbackProvider, taskType)) {
      throw routeError(`Fallback AI provider ${fallbackProvider} does not support ${taskGroup(taskType)} generation.`, 422);
    }
    if (fallbackModel && !isModelAllowed({ provider: fallbackProvider, model: fallbackModel, allowedModels, taskType })) {
      throw routeError(`Fallback AI model ${fallbackModel} is not allowed by the active plan.`, 422);
    }
  }

  const providerConfig = await AiProviderConfig.findOne({ slug: provider, isActive: true });
  return {
    provider,
    model,
    fallbackProvider,
    fallbackModel,
    priority: config?.queuePriority || activePlan?.queuePriority || 5,
    providerConfig,
    plan: activePlan
  };
}

module.exports = { chooseProvider, providerFieldForTask, resolvePlanAiConfig };

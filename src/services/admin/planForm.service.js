const LIMIT_FIELDS = [
  ['maxBrands', 'Max brands'],
  ['maxSocialAccounts', 'Max social accounts'],
  ['maxTeamMembers', 'Max team members'],
  ['maxScheduledPosts', 'Max scheduled posts'],
  ['maxAutoPosts', 'Max auto posts'],
  ['maxHandoffPosts', 'Max handoff posts'],
  ['maxAiTextGenerations', 'Max AI text generations'],
  ['maxAiImageGenerations', 'Max AI image generations'],
  ['maxAiVideoGenerations', 'Max AI video generations'],
  ['maxAvatarVideos', 'Max avatar videos'],
  ['maxStorageMb', 'Max storage MB'],
  ['maxClientApprovalLinks', 'Max client approval links']
].map(([name, label]) => ({ name, label, type: 'number', help: 'Use -1 for unlimited.' }));

const LEVEL_FIELDS = [
  { name: 'brandBrainLevel', label: 'Brand Brain level', options: ['none', 'basic', 'advanced', 'premium', 'unlimited'] },
  { name: 'smartComposerLevel', label: 'Smart Composer level', options: ['none', 'basic', 'advanced', 'premium', 'unlimited'] },
  { name: 'analyticsLevel', label: 'Analytics level', options: ['none', 'basic', 'standard', 'advanced', 'premium', 'unlimited'] }
];

const FEATURE_FLAGS = [
  ['calendarAccess', 'Calendar'],
  ['campaignAccess', 'Campaigns'],
  ['growthStudioAccess', 'Growth Studio'],
  ['autoModeAccess', 'Auto Mode'],
  ['handoffModeAccess', 'Handoff Mode'],
  ['approvalWorkflowAccess', 'Approval workflow'],
  ['clientApprovalPortalAccess', 'Client approval portal'],
  ['contentRepurposingAccess', 'Content repurposing'],
  ['bulkCreateAccess', 'Bulk create'],
  ['contentScoreAccess', 'Content score'],
  ['brandFitCheckerAccess', 'Brand fit checker'],
  ['riskCheckerAccess', 'Risk checker'],
  ['bestTimeSuggestionAccess', 'Best-time suggestions'],
  ['competitorWatchAccess', 'Competitor watch'],
  ['whiteLabelAccess', 'White label'],
  ['prioritySupportAccess', 'Priority support'],
  ['templateAccess', 'Templates'],
  ['failedPostRecoveryAccess', 'Failed post recovery'],
  ['agencyWorkspaceAccess', 'Agency workspace']
].map(([name, label]) => ({ name, label }));

const AI_PROVIDER_OPTIONS = ['local', 'openai', 'gemini', 'deepseek', 'groq', 'anthropic', 'mistral', 'replicate', 'stability', 'fal'];
const BILLING_INTERVALS = ['trial', 'month', 'year', 'one_time', 'manual'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'UGX', 'KES', 'NGN', 'ZAR', 'GHS'];

function toPlain(value) {
  if (!value) return {};
  if (typeof value.toObject === 'function') return value.toObject({ getters: false, virtuals: false });
  return value;
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null && String(item).trim() !== '');
  return [value].filter((item) => String(item).trim() !== '');
}

function parseLines(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseBoolean(value) {
  return value === true || value === 'true' || value === 'on' || value === '1' || value === 1;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function pickSection(body, name) {
  const value = body?.[name];
  return value && typeof value === 'object' ? value : {};
}

function buildLimits(body) {
  const input = pickSection(body, 'limits');
  return LIMIT_FIELDS.reduce((limits, field) => {
    limits[field.name] = parseNumber(input[field.name], field.name === 'maxStorageMb' ? 250 : 0);
    return limits;
  }, {});
}

function buildFeatures(body) {
  const input = pickSection(body, 'features');
  const features = {};
  for (const field of LEVEL_FIELDS) {
    const value = String(input[field.name] || '').trim();
    features[field.name] = field.options.includes(value) ? value : field.options[1];
  }
  for (const field of FEATURE_FLAGS) {
    features[field.name] = parseBoolean(input[field.name]);
  }
  return features;
}

function buildAiConfig(body) {
  const input = pickSection(body, 'aiConfig');
  return {
    allowedProviders: toArray(input.allowedProviders).map((item) => String(item).trim()).filter(Boolean),
    allowedModels: parseLines(input.allowedModels),
    defaultTextProvider: String(input.defaultTextProvider || 'local').trim(),
    defaultTextModel: String(input.defaultTextModel || 'local-fast').trim(),
    defaultImageProvider: String(input.defaultImageProvider || '').trim(),
    defaultImageModel: String(input.defaultImageModel || '').trim(),
    defaultVideoProvider: String(input.defaultVideoProvider || '').trim(),
    defaultVideoModel: String(input.defaultVideoModel || '').trim(),
    fallbackProvider: String(input.fallbackProvider || 'local').trim(),
    fallbackModel: String(input.fallbackModel || 'local-fallback').trim(),
    allowUserProviderSelection: parseBoolean(input.allowUserProviderSelection),
    monthlyTokenLimit: parseNumber(input.monthlyTokenLimit, 0),
    monthlyImageLimit: parseNumber(input.monthlyImageLimit, 0),
    monthlyVideoLimit: parseNumber(input.monthlyVideoLimit, 0)
  };
}

function buildMetadata(body) {
  const input = pickSection(body, 'metadata');
  const metadata = {
    displayBadge: String(input.displayBadge || '').trim(),
    supportNote: String(input.supportNote || '').trim(),
    internalNotes: String(input.internalNotes || '').trim()
  };
  const extra = parseJson(input.extraJson, {});
  return Object.entries({ ...metadata, ...extra }).reduce((clean, [key, value]) => {
    if (value === undefined || value === null || value === '') return clean;
    clean[key] = value;
    return clean;
  }, {});
}

function buildPlanPayload(body = {}) {
  return {
    name: String(body.name || '').trim(),
    slug: String(body.slug || '').trim().toLowerCase(),
    description: String(body.description || '').trim(),
    price: parseNumber(body.price, 0),
    currency: String(body.currency || 'USD').trim().toUpperCase(),
    billingInterval: String(body.billingInterval || 'month').trim(),
    trialDays: parseNumber(body.trialDays, 0),
    isActive: parseBoolean(body.isActive),
    isPublic: parseBoolean(body.isPublic),
    isPopular: parseBoolean(body.isPopular),
    sortOrder: parseNumber(body.sortOrder, 100),
    queuePriority: parseNumber(body.queuePriority, 5),
    taxBehavior: String(body.taxBehavior || '').trim(),
    paymentProviderPlanId: String(body.paymentProviderPlanId || '').trim(),
    featureList: parseLines(body.featureList),
    limits: buildLimits(body),
    features: buildFeatures(body),
    aiConfig: buildAiConfig(body),
    metadata: buildMetadata(body)
  };
}

function formValue(plan, section, field, fallback = '') {
  const source = section ? toPlain(plan?.[section]) : toPlain(plan);
  const value = source?.[field];
  if (Array.isArray(value)) return value.join('\n');
  return value === undefined || value === null ? fallback : value;
}

function formChecked(plan, section, field, fallback = false) {
  const source = section ? toPlain(plan?.[section]) : toPlain(plan);
  const value = source?.[field];
  return value === undefined || value === null ? fallback : Boolean(value);
}

function selectedValues(plan, section, field) {
  const source = section ? toPlain(plan?.[section]) : toPlain(plan);
  return toArray(source?.[field]).map((item) => String(item));
}

module.exports = {
  AI_PROVIDER_OPTIONS,
  BILLING_INTERVALS,
  CURRENCIES,
  FEATURE_FLAGS,
  LEVEL_FIELDS,
  LIMIT_FIELDS,
  buildAiConfig,
  buildFeatures,
  buildLimits,
  buildMetadata,
  buildPlanPayload,
  formChecked,
  formValue,
  parseBoolean,
  parseLines,
  parseNumber,
  parseJson,
  selectedValues
};

function objectValue(source, key) {
  if (!source) return undefined;
  if (typeof source.get === 'function') return source.get(key);
  return source[key];
}

function decoratePlanForDisplay(plan) {
  const price = Number(objectValue(plan, 'price') || 0);
  const billingInterval = objectValue(plan, 'billingInterval') || 'month';
  const limits = objectValue(plan, 'limits') || {};
  const features = objectValue(plan, 'features') || {};
  const aiConfig = objectValue(plan, 'aiConfig') || {};
  const featureList = objectValue(plan, 'featureList') || [];
  const slug = objectValue(plan, 'slug');
  const isTrial = billingInterval === 'trial' || price === 0;
  const intervalLabel = billingInterval === 'trial' ? 'trial' : billingInterval === 'year' ? 'yr' : billingInterval === 'one_time' ? 'once' : 'mo';
  const displayFeatures = featureList.length ? featureList : buildFeatureList(limits, features);
  return {
    id: objectValue(plan, '_id')?.toString?.() || slug,
    name: objectValue(plan, 'name'),
    slug,
    description: objectValue(plan, 'description') || '',
    price,
    currency: objectValue(plan, 'currency') || 'USD',
    billingInterval,
    priceLabel: isTrial ? 'Free' : formatPrice(price, objectValue(plan, 'currency') || 'USD'),
    intervalLabel,
    trialDays: Number(objectValue(plan, 'trialDays') || 0),
    isTrial,
    isPopular: Boolean(objectValue(plan, 'isPopular')),
    isPublic: objectValue(plan, 'isPublic') !== false,
    sortOrder: Number(objectValue(plan, 'sortOrder') || 100),
    limits,
    features,
    aiConfig,
    featureList: displayFeatures,
    limitList: buildLimitList(limits),
    comparison: buildComparisonRows(limits, features, aiConfig),
    signupUrl: `/start/${encodeURIComponent(slug)}`,
    loginUrl: `/auth/login?next=${encodeURIComponent(`/dashboard/billing/checkout/${slug}`)}`,
    checkoutUrl: `/dashboard/billing/checkout/${encodeURIComponent(slug)}`,
    viewUrl: `/pricing/${encodeURIComponent(slug)}`
  };
}

function formatPrice(price, currency = 'USD') {
  const prefix = String(currency).toUpperCase() === 'USD' ? '$' : `${String(currency).toUpperCase()} `;
  return `${prefix}${price % 1 ? price.toFixed(2) : price.toFixed(0)}`;
}

function buildFeatureList(limits = {}, features = {}) {
  const items = [];
  if (limits.maxBrands !== undefined) items.push(`${limitText(limits.maxBrands)} brands`);
  if (limits.maxSocialAccounts !== undefined) items.push(`${limitText(limits.maxSocialAccounts)} social accounts`);
  if (limits.maxScheduledPosts !== undefined) items.push(`${limitText(limits.maxScheduledPosts)} scheduled posts/month`);
  if (limits.maxAiTextGenerations !== undefined) items.push(`${limitText(limits.maxAiTextGenerations)} AI text generations`);
  if (limits.maxAiImageGenerations !== undefined) items.push(`${limitText(limits.maxAiImageGenerations)} AI images`);
  if (limits.maxAiVideoGenerations !== undefined) items.push(`${limitText(limits.maxAiVideoGenerations)} AI videos`);
  if (features.autoModeAccess) items.push('Auto Mode');
  if (features.approvalWorkflowAccess) items.push('Approval workflows');
  if (features.whiteLabelAccess) items.push('White label');
  return items;
}

function buildLimitList(limits = {}) {
  const labels = {
    maxBrands: 'Brands',
    maxSocialAccounts: 'Social accounts',
    maxTeamMembers: 'Team members',
    maxScheduledPosts: 'Scheduled posts',
    maxAutoPosts: 'Auto posts',
    maxHandoffPosts: 'Handoff posts',
    maxAiTextGenerations: 'AI text generations',
    maxAiImageGenerations: 'AI images',
    maxAiVideoGenerations: 'AI videos',
    maxAvatarVideos: 'Avatar videos',
    maxStorageMb: 'Storage MB',
    maxClientApprovalLinks: 'Client approval links'
  };
  return Object.entries(labels).map(([key, label]) => ({ key, label, value: limitText(limits[key]) }));
}

function buildComparisonRows(limits = {}, features = {}, aiConfig = {}) {
  return [
    { label: 'Brand Brain', value: titleValue(features.brandBrainLevel || 'basic') },
    { label: 'Smart Composer', value: titleValue(features.smartComposerLevel || 'basic') },
    { label: 'Analytics', value: titleValue(features.analyticsLevel || 'basic') },
    { label: 'Auto Mode', value: yesNo(features.autoModeAccess) },
    { label: 'Handoff Mode', value: yesNo(features.handoffModeAccess) },
    { label: 'Approvals', value: yesNo(features.approvalWorkflowAccess) },
    { label: 'Bulk create', value: yesNo(features.bulkCreateAccess) },
    { label: 'Content score', value: yesNo(features.contentScoreAccess) },
    { label: 'Brand fit checker', value: yesNo(features.brandFitCheckerAccess) },
    { label: 'Risk checker', value: yesNo(features.riskCheckerAccess) },
    { label: 'White label', value: yesNo(features.whiteLabelAccess) },
    { label: 'AI providers', value: Array.isArray(aiConfig.allowedProviders) && aiConfig.allowedProviders.length ? aiConfig.allowedProviders.join(', ') : 'Plan default' },
    { label: 'Queue priority', value: String(aiConfig.queuePriority || 'Plan default') }
  ];
}

function yesNo(value) {
  return value ? 'Included' : 'Not included';
}

function titleValue(value = '') {
  return String(value || 'basic').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function limitText(value) {
  if (value === undefined || value === null || value === '') return '0';
  return Number(value) < 0 ? 'Unlimited' : String(value);
}

module.exports = { buildFeatureList, buildLimitList, decoratePlanForDisplay, limitText };

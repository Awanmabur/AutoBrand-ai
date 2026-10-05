function objectValue(source, key) {
  if (!source) return undefined;
  if (typeof source.get === 'function') return source.get(key);
  return source[key];
}

const PLAN_PRESENTATION = Object.freeze({
  'free-trial': {
    displayName: 'Free Trial',
    family: 'trial',
    familyLabel: 'Try first',
    workflowLabel: 'Manual publishing + limited AI',
    bestFor: 'New users who want to test the real workflow before paying.',
    outcome: 'Explore Brand Brain, manual publishing, basic AI text/images, calendar and handoff for seven days.'
  },
  'manual-publisher': {
    displayName: 'Publish',
    family: 'manual',
    familyLabel: 'Bring your own AI',
    workflowLabel: 'Bring your own text and media · ChatGPT + Drive',
    bestFor: 'Businesses and creators who use ChatGPT or their own creative tools and want affordable scheduling, approvals, analytics and reliable publishing.',
    outcome: 'Let ChatGPT create and manage assets while AutoBrand handles storage, scheduling, publishing and performance.'
  },
  starter: {
    displayName: 'AI Starter',
    family: 'ai',
    familyLabel: 'AI essentials',
    workflowLabel: 'AI-assisted content',
    bestFor: 'Solo brands that want AI captions and images with simple scheduling.',
    outcome: 'Add AI assistance to the manual publishing workflow without advanced automation.'
  },
  growth: {
    displayName: 'Growth',
    family: 'ai',
    familyLabel: 'AI + campaigns',
    workflowLabel: 'Campaigns, approvals and limited automation',
    bestFor: 'Growing teams that need campaign planning, approvals, AI video and limited Auto Mode.',
    outcome: 'Coordinate a small marketing team and automate repeatable content work.'
  },
  pro: {
    displayName: 'Pro',
    family: 'ai',
    familyLabel: 'Advanced AI',
    workflowLabel: 'High-volume AI + video',
    bestFor: 'Serious content operations that need larger limits, scoring, bulk creation and video.',
    outcome: 'Run a higher-volume content operation with advanced analytics and creative tooling.'
  },
  business: {
    displayName: 'Business',
    family: 'ai',
    familyLabel: 'Team operations',
    workflowLabel: 'Large-team AI operations',
    bestFor: 'Larger organizations managing more brands, users, approvals and recovery workflows.',
    outcome: 'Operate multiple teams and client-style workflows with priority support and recovery.'
  },
  agency: {
    displayName: 'Agency',
    family: 'ai',
    familyLabel: 'Agency scale',
    workflowLabel: 'Multi-client + white label',
    bestFor: 'Agencies managing many brands and client workspaces at high volume.',
    outcome: 'Scale multi-client delivery with white label, portals and the highest queue priority.'
  },
  superadmin: {
    displayName: 'Superadmin',
    family: 'internal',
    familyLabel: 'Internal',
    workflowLabel: 'Platform administration',
    bestFor: 'Internal AutoBrand platform administration only.',
    outcome: 'Unlimited platform administration and operational access.'
  }
});

function planPresentation(slug, features = {}, limits = {}) {
  const normalized = String(slug || '').trim().toLowerCase();
  if (PLAN_PRESENTATION[normalized]) return PLAN_PRESENTATION[normalized];
  const aiEnabled = Number(limits.maxAiTextGenerations || 0) !== 0 || Number(limits.maxAiImageGenerations || 0) !== 0 || Number(limits.maxAiVideoGenerations || 0) !== 0;
  const manualOnly = Boolean(features.manualPublisherAccess) && !aiEnabled;
  return {
    displayName: '',
    family: manualOnly ? 'manual' : aiEnabled ? 'ai' : 'standard',
    familyLabel: manualOnly ? 'No-AI plan' : aiEnabled ? 'AI plan' : 'Plan',
    workflowLabel: manualOnly ? 'Bring your own text and media' : aiEnabled ? 'AI-assisted workflow' : 'Workspace features',
    bestFor: manualOnly ? 'Teams that want publishing infrastructure without generative AI.' : 'Teams whose needs match these plan limits.',
    outcome: manualOnly ? 'Publish without generative-AI usage.' : 'Use the included workspace features and limits.'
  };
}

function decoratePlanForDisplay(plan) {
  const price = Number(objectValue(plan, 'price') || 0);
  const billingInterval = objectValue(plan, 'billingInterval') || 'month';
  const limits = objectValue(plan, 'limits') || {};
  const features = objectValue(plan, 'features') || {};
  const aiConfig = objectValue(plan, 'aiConfig') || {};
  const featureList = objectValue(plan, 'featureList') || [];
  const slug = objectValue(plan, 'slug');
  const rawName = objectValue(plan, 'name') || '';
  const currency = String(objectValue(plan, 'currency') || 'USD').toUpperCase();
  const trialDays = Number(objectValue(plan, 'trialDays') || 0);
  const includedCredits = Number(objectValue(plan, 'includedCredits') || 0);
  const isTrial = billingInterval === 'trial';
  const isFree = price <= 0;
  const intervalLabel = billingInterval === 'trial' ? 'trial' : billingInterval === 'year' ? 'year' : billingInterval === 'one_time' ? 'one time' : 'month';
  const presentation = planPresentation(slug, features, limits);
  const displayFeatures = featureList.length ? featureList : buildFeatureList(limits, features);
  const name = presentation.displayName || rawName;
  const accessPeriodLabel = billingInterval === 'trial' ? `${trialDays || 7}-day trial` : billingInterval === 'year' ? '1 year of access' : billingInterval === 'one_time' ? 'one-time access' : '1 month of access';
  const priceLabel = isTrial ? `${formatMoney(0, currency)} · ${trialDays || 7} days` : isFree ? formatMoney(0, currency) : formatMoney(price, currency);
  const recurringPriceLabel = isTrial ? priceLabel : billingInterval === 'one_time' ? `${formatMoney(price, currency)} · one time` : `${formatMoney(price, currency)} · ${accessPeriodLabel}`;
  const billingSummary = buildBillingSummary({ price, currency, billingInterval, trialDays });
  const aiCreditsLabel = includedCredits < 0 ? 'Unlimited AI credits' : includedCredits === 0 ? '0 AI credits · no generative AI budget' : `${formatNumber(includedCredits)} AI credits / ${isTrial ? `${trialDays || 7}-day trial` : 'paid access period'}`;
  const aiIncluded = includedCredits !== 0 || Number(limits.maxAiTextGenerations || 0) !== 0 || Number(limits.maxAiImageGenerations || 0) !== 0 || Number(limits.maxAiVideoGenerations || 0) !== 0;
  const usageResetLabel = isTrial ? `Usage allowances run for the ${trialDays || 7}-day trial` : billingInterval === 'month' ? 'Usage allowances run from payment activation until the 1-month access period ends; a new verified payment starts a new allowance period' : billingInterval === 'year' ? 'Usage allowances run from payment activation until the 1-year access period ends; a new verified payment starts a new allowance period' : 'One-time entitlement';
  const paymentCadenceLabel = isTrial ? 'No payment required' : billingInterval === 'one_time' ? 'One-time payment' : 'Manual Pesapal payment for each access period';
  const autoRenewalLabel = isTrial ? 'No automatic paid conversion' : billingInterval === 'one_time' ? 'No renewal' : 'No automatic renewal or automatic charge';

  return {
    id: objectValue(plan, '_id')?.toString?.() || slug,
    name,
    rawName,
    slug,
    description: objectValue(plan, 'description') || '',
    price,
    currency,
    currencyLabel: moneyCurrencyLabel(currency),
    billingInterval,
    priceLabel,
    recurringPriceLabel,
    intervalLabel,
    accessPeriodLabel,
    billingSummary,
    paymentSummary: isTrial ? 'No payment required. The trial does not automatically become a paid plan.' : `Paid securely through Pesapal. One verified payment activates one access period. AutoBrand does not automatically charge the next period; pay again through Pesapal if you want to continue.`,
    paymentCadenceLabel,
    autoRenewalLabel,
    localCurrencyNote: isTrial ? '' : `Plan prices are charged in ${currency}. If your payment provider converts currency, its exchange rate or fees may apply at checkout.`,
    trialDays,
    isTrial,
    isFree,
    isPopular: Boolean(objectValue(plan, 'isPopular')),
    isPublic: objectValue(plan, 'isPublic') !== false,
    sortOrder: Number(objectValue(plan, 'sortOrder') || 100),
    includedCredits,
    aiCreditsLabel,
    aiIncluded,
    aiModeLabel: aiIncluded ? (presentation.family === 'trial' ? 'Limited AI included' : 'Generative AI included') : 'No generative AI',
    usageResetLabel,
    family: presentation.family,
    familyLabel: presentation.familyLabel,
    workflowLabel: presentation.workflowLabel,
    bestFor: presentation.bestFor,
    outcome: presentation.outcome,
    limits,
    features,
    aiConfig,
    featureList: displayFeatures,
    limitList: buildLimitList(limits, { billingInterval, trialDays }),
    comparison: buildComparisonRows(limits, features, aiConfig),
    signupUrl: `/start/${encodeURIComponent(slug)}`,
    loginUrl: `/auth/login?next=${encodeURIComponent(`/dashboard/billing/checkout/${slug}`)}`,
    checkoutUrl: `/dashboard/billing/checkout/${encodeURIComponent(slug)}`,
    viewUrl: `/pricing/${encodeURIComponent(slug)}`
  };
}

function moneyCurrencyLabel(currency = 'USD') {
  const code = String(currency || 'USD').toUpperCase();
  if (code === 'USD') return 'US dollars (USD)';
  return code;
}

function formatMoney(price, currency = 'USD', { decimals = false } = {}) {
  const code = String(currency || 'USD').toUpperCase();
  const amount = Number(price || 0);
  const digits = decimals || amount % 1 ? 2 : 0;
  if (code === 'USD') return `US$${amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(amount).replace(/\u00a0/g, ' ');
  } catch (error) {
    return `${code} ${amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }
}

function formatNumber(value) {
  if (Number(value) < 0) return 'Unlimited';
  return Number(value || 0).toLocaleString('en-US');
}

function buildBillingSummary({ price, currency, billingInterval, trialDays }) {
  if (billingInterval === 'trial') return `${trialDays || 7}-day Free Trial · ${formatMoney(0, currency)} · no payment · no automatic paid conversion`;
  if (billingInterval === 'one_time') return `${formatMoney(price, currency)} · one-time payment`;
  if (billingInterval === 'year') return `${formatMoney(price, currency)} · 1 year of access · manual Pesapal payment · no automatic renewal`;
  return `${formatMoney(price, currency)} · 1 month of access · manual Pesapal payment · no automatic renewal`;
}

function buildFeatureList(limits = {}, features = {}) {
  const items = [];
  if (limits.maxBrands !== undefined) items.push(`${limitText(limits.maxBrands)} brands`);
  if (limits.maxSocialAccounts !== undefined) items.push(`${limitText(limits.maxSocialAccounts)} social accounts`);
  if (limits.maxScheduledPosts !== undefined) items.push(`${limitText(limits.maxScheduledPosts)} scheduled posts / access period`);
  if (limits.maxAiTextGenerations !== undefined) items.push(`${limitText(limits.maxAiTextGenerations)} AI text generations`);
  if (limits.maxAiImageGenerations !== undefined) items.push(`${limitText(limits.maxAiImageGenerations)} AI images`);
  if (limits.maxAiVideoGenerations !== undefined) items.push(`${limitText(limits.maxAiVideoGenerations)} AI videos`);
  if (features.autoModeAccess) items.push('Auto Mode');
  if (features.approvalWorkflowAccess) items.push('Approval workflows');
  if (features.whiteLabelAccess) items.push('White label');
  return items;
}

function buildLimitList(limits = {}, { billingInterval = 'month', trialDays = 0 } = {}) {
  const period = billingInterval === 'trial' ? `${trialDays || 7}-day trial` : billingInterval === 'year' ? '1-year access period' : '1-month access period';
  const rows = [
    ['maxBrands', 'Active brands', 'capacity'],
    ['maxSocialAccounts', 'Connected social accounts', 'capacity'],
    ['maxTeamMembers', 'Team members', 'capacity'],
    ['maxScheduledPosts', 'Scheduled posts', 'period'],
    ['maxManualPosts', 'Manual/imported posts', 'period'],
    ['maxAutoPosts', 'Auto posts', 'period'],
    ['maxHandoffPosts', 'Handoff posts', 'period'],
    ['maxAiTextGenerations', 'AI text generations', 'period'],
    ['maxAiImageGenerations', 'AI images', 'period'],
    ['maxAiVideoGenerations', 'AI videos', 'period'],
    ['maxAvatarVideos', 'Avatar videos', 'period'],
    ['maxClientApprovalLinks', 'Client approval links', 'period'],
    ['maxStorageMb', 'Media storage', 'storage']
  ];
  return rows.map(([key, label, type]) => {
    const rawValue = limits[key];
    let value = limitText(rawValue);
    if (key === 'maxStorageMb' && Number(rawValue) >= 0) value = formatStorageMb(rawValue);
    const suffix = type === 'period' ? ` / ${period}` : type === 'capacity' ? ' at a time' : ' total';
    return { key, label, value, type, detail: `${value}${suffix}` };
  });
}

function formatStorageMb(value) {
  const mb = Number(value || 0);
  if (mb < 0) return 'Unlimited';
  if (mb >= 1000 && mb % 1000 === 0) return `${(mb / 1000).toLocaleString('en-US')} GB`;
  if (mb >= 1000) return `${Number((mb / 1000).toFixed(1)).toLocaleString('en-US')} GB`;
  return `${mb.toLocaleString('en-US')} MB`;
}

function buildComparisonRows(limits = {}, features = {}, aiConfig = {}) {
  return [
    { label: 'Brand Brain', value: titleValue(features.brandBrainLevel || 'basic') },
    { label: 'Smart Composer', value: titleValue(features.smartComposerLevel || 'basic') },
    { label: 'Analytics', value: titleValue(features.analyticsLevel || 'basic') },
    { label: 'Manual Publisher', value: yesNo(features.manualPublisherAccess) },
    { label: 'Auto Mode', value: yesNo(features.autoModeAccess) },
    { label: 'Handoff Mode', value: yesNo(features.handoffModeAccess) },
    { label: 'Approvals', value: yesNo(features.approvalWorkflowAccess) },
    { label: 'ChatGPT connector', value: yesNo(Boolean(features.chatgptConnectorAccess)) },
    { label: 'Google Drive assets', value: yesNo(Boolean(features.googleDriveAccess)) },
    { label: 'Channel workspaces', value: yesNo(Boolean(features.channelWorkspacesAccess)) },
    { label: 'Bulk create', value: yesNo(features.bulkCreateAccess) },
    { label: 'Content score', value: yesNo(features.contentScoreAccess) },
    { label: 'Brand fit checker', value: yesNo(features.brandFitCheckerAccess) },
    { label: 'Risk checker', value: yesNo(features.riskCheckerAccess) },
    { label: 'White label', value: yesNo(features.whiteLabelAccess) },
    { label: 'AI providers', value: Array.isArray(aiConfig.allowedProviders) && aiConfig.allowedProviders.length ? aiConfig.allowedProviders.join(', ') : 'None' },
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
  return Number(value) < 0 ? 'Unlimited' : formatNumber(value);
}

module.exports = {
  PLAN_PRESENTATION,
  buildBillingSummary,
  buildFeatureList,
  buildLimitList,
  decoratePlanForDisplay,
  formatMoney,
  formatNumber,
  formatStorageMb,
  limitText,
  moneyCurrencyLabel,
  planPresentation
};

const DASHBOARD_PAGES = [
  'overview',
  'quick-create',
  'team',
  'brand-brain',
  'content-library',
  'campaigns',
  'media',
  'video-system',
  'avatar-video',
  'calendar',
  'social',
  'approvals',
  'analytics',
  'notifications',
  'billing',
  'settings',
  'admin',
  'plans',
  'errors'
];

const PAGE_ALIASES = {
  '/dashboard': 'overview',
  dashboard: 'overview',
  'post-editor': 'content-library',
  roles: 'team',
  users: 'team',
  posts: 'content-library',
  drafts: 'content-library',
  billings: 'billing',
  ai: 'quick-create',
  'ai-generator': 'quick-create',
  'content-generator': 'quick-create',
  brands: 'brand-brain',
  templates: 'video-system',
  videos: 'video-system',
  avatars: 'avatar-video',
  'avatar-consent': 'avatar-video',
  'auto-handoff': 'approvals',
  handoff: 'approvals',
  'image-workflows': 'media',
  images: 'media',
  'growthstudio': 'campaigns',
  'growth_studio': 'campaigns',
  'growth-studio': 'campaigns',
  whatsapp: 'social',
  'google-business': 'social',
  pinterest: 'social',
  x: 'social',
  twitter: 'social',
  threads: 'social',
  'admin-plans': 'plans',
  'admin/plans': 'plans',
  plans: 'plans',
  error: 'errors',
  errors: 'errors',
  'dashboard-error': 'errors'
};

const ADMIN_ROLES = [
  'super_admin',
  'platform_admin',
  'billing_admin',
  'ai_manager',
  'integration_manager',
  'content_moderator',
  'support_agent',
  'analyst'
];

const ROLE_PAGE_ACCESS = {
  super_admin: DASHBOARD_PAGES,
  platform_admin: DASHBOARD_PAGES.filter((page) => !['billing'].includes(page)),
  billing_admin: ['overview', 'billing', 'analytics', 'notifications', 'settings', 'admin', 'plans', 'errors'],
  ai_manager: ['overview', 'quick-create', 'brand-brain', 'media', 'campaigns', 'analytics', 'notifications', 'settings', 'admin', 'plans', 'errors'],
  integration_manager: ['overview', 'social', 'notifications', 'settings', 'admin', 'errors'],
  content_moderator: ['overview', 'content-library', 'calendar', 'approvals', 'analytics', 'notifications', 'settings', 'admin', 'errors'],
  support_agent: ['overview', 'team', 'billing', 'social', 'approvals', 'notifications', 'settings', 'admin', 'errors'],
  analyst: ['overview', 'analytics', 'calendar', 'campaigns', 'notifications', 'admin', 'errors'],
  agency_owner: DASHBOARD_PAGES.filter((page) => !['admin', 'plans'].includes(page)),
  brand_owner: DASHBOARD_PAGES.filter((page) => !['admin', 'plans'].includes(page)),
  team_owner: DASHBOARD_PAGES.filter((page) => !['admin', 'plans'].includes(page)),
  content_creator: [
    'overview', 'quick-create', 'brand-brain', 'content-library',
    'campaigns', 'media', 'video-system', 'avatar-video',
    'calendar', 'social', 'approvals', 'analytics', 'notifications', 'settings', 'errors'
  ],
  client_reviewer: ['overview', 'content-library', 'calendar', 'approvals', 'analytics', 'notifications', 'settings', 'errors'],
  team_member: ['overview', 'quick-create', 'content-library', 'media', 'calendar', 'approvals', 'analytics', 'notifications', 'settings', 'errors']
};

const DEFAULT_PLAN_FEATURES = {
  brandBrainLevel: 'basic',
  smartComposerLevel: 'basic',
  analyticsLevel: 'basic',
  calendarAccess: true,
  campaignAccess: false,
  growthStudioAccess: false,
  autoModeAccess: false,
  handoffModeAccess: true,
  approvalWorkflowAccess: false,
  clientApprovalPortalAccess: false,
  contentRepurposingAccess: false,
  bulkCreateAccess: false,
  contentScoreAccess: false,
  brandFitCheckerAccess: false,
  riskCheckerAccess: false,
  bestTimeSuggestionAccess: false,
  competitorWatchAccess: false,
  whiteLabelAccess: false,
  prioritySupportAccess: false,
  templateAccess: true,
  failedPostRecoveryAccess: false,
  agencyWorkspaceAccess: false,
  teamAccess: true
};

const PAGE_REQUIREMENTS = {
  overview: { always: true },
  errors: { always: true },
  settings: { always: true },
  notifications: { always: true },
  billing: { always: true },
  security: { always: true },
  admin: { roleOnly: true },
  plans: { roleOnly: true },
  roles: { limit: 'maxTeamMembers', min: 1, upgrade: 'Invite teammates' },
  users: { limit: 'maxTeamMembers', min: 1, upgrade: 'Invite teammates' },
  team: { limit: 'maxTeamMembers', min: 1, upgrade: 'Invite teammates' },
  'brand-brain': { limit: 'maxBrands', min: 1, upgrade: 'Create more brands' },
  'quick-create': { feature: 'smartComposerLevel', level: 'basic', limit: 'maxAiTextGenerations', min: 1, upgrade: 'Create AI content' },
  'content-generator': { feature: 'smartComposerLevel', level: 'basic', limit: 'maxAiTextGenerations', min: 1, upgrade: 'Generate content' },
  'content-library': { always: true },
  calendar: { feature: 'calendarAccess', upgrade: 'Use calendar scheduling' },
  media: { limit: 'maxStorageMb', min: 1, upgrade: 'Use the media library' },
  campaigns: { feature: 'campaignAccess', upgrade: 'Run campaigns' },
  'video-system': { limit: 'maxAiVideoGenerations', min: 1, upgrade: 'Generate AI videos' },
  'avatar-video': { limit: 'maxAvatarVideos', min: 1, upgrade: 'Generate avatar videos' },
  approvals: { anyFeature: ['approvalWorkflowAccess', 'handoffModeAccess', 'clientApprovalPortalAccess'], upgrade: 'Use approvals and handoff review' },
  analytics: { feature: 'analyticsLevel', level: 'basic', upgrade: 'View analytics' },
  social: { limit: 'maxSocialAccounts', min: 1, upgrade: 'Connect social accounts' },
  integrations: { limit: 'maxSocialAccounts', min: 1, upgrade: 'Connect integrations' },
  'growth-studio': { anyFeature: ['growthStudioAccess', 'campaignAccess'], upgrade: 'Run campaigns and growth workflows' },
};

const LEVELS = {
  none: 0,
  false: 0,
  basic: 1,
  standard: 2,
  advanced: 3,
  premium: 4,
  unlimited: 100,
  true: 100
};

function normalizePage(page) {
  const raw = String(page || 'overview')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/^dashboard\/?/, '')
    .split('/')[0]
    .toLowerCase();
  return PAGE_ALIASES[raw] || raw || 'overview';
}

function normalizeRole(role) {
  const normalized = String(role || 'brand_owner').trim().toLowerCase();
  return ROLE_PAGE_ACCESS[normalized] ? normalized : 'brand_owner';
}

function isAdminRole(role) {
  return ADMIN_ROLES.includes(normalizeRole(role));
}

function uniquePages(pages = []) {
  return [...new Set(pages.map(normalizePage).filter((page) => DASHBOARD_PAGES.includes(page)))];
}

function pagesForRole(role) {
  return uniquePages(ROLE_PAGE_ACCESS[normalizeRole(role)] || ROLE_PAGE_ACCESS.brand_owner);
}

function isUnlimited(value, user) {
  return user?.role === 'super_admin' || Number(value) < 0;
}

function numericLimitAllows(plan, user, limitName, min = 1) {
  const limit = plan?.limits?.[limitName];
  if (isUnlimited(limit, user)) return true;
  return Number(limit || 0) >= Number(min || 1);
}

function featureAllows(features = {}, feature, requiredLevel = null) {
  const value = features?.[feature];
  if (requiredLevel) {
    const current = LEVELS[String(value ?? 'none').toLowerCase()] ?? (value ? 1 : 0);
    const needed = LEVELS[String(requiredLevel).toLowerCase()] ?? 1;
    return current >= needed;
  }
  return Boolean(value);
}

function planAllowsPage({ page, plan, user }) {
  if (user?.role === 'super_admin') return { allowed: true };
  const requirement = PAGE_REQUIREMENTS[normalizePage(page)] || { always: true };
  const features = { ...DEFAULT_PLAN_FEATURES, ...(plan?.features || {}) };
  if (requirement.always || requirement.roleOnly) return { allowed: true };

  const failedReasons = [];
  if (requirement.feature && !featureAllows(features, requirement.feature, requirement.level)) {
    failedReasons.push(requirement.upgrade || `Enable ${requirement.feature}`);
  }
  if (Array.isArray(requirement.anyFeature) && !requirement.anyFeature.some((feature) => featureAllows(features, feature))) {
    failedReasons.push(requirement.upgrade || `Enable ${requirement.anyFeature.join(' or ')}`);
  }
  if (requirement.limit && !numericLimitAllows(plan, user, requirement.limit, requirement.min || 1)) {
    failedReasons.push(requirement.upgrade || `Increase ${requirement.limit}`);
  }

  if (!failedReasons.length) return { allowed: true };
  return {
    allowed: false,
    reason: failedReasons[0],
    requirement,
    upgradeUrl: '/pricing',
    billingUrl: '/dashboard/billing'
  };
}

function roleCapabilities(role, roleAllowedPages = pagesForRole(role)) {
  const pages = new Set(roleAllowedPages);
  const has = (page) => pages.has(page);
  return {
    role: normalizeRole(role),
    isAdmin: isAdminRole(role),
    canManageUsers: has('team'),
    canManageBilling: has('billing'),
    canManageAdmin: has('admin'),
    canConnectSocial: has('social'),
    canCreateContent: has('quick-create'),
    canApprove: has('approvals'),
    canViewAnalytics: has('analytics')
  };
}

function buildFeatureAccess({ user = {}, plan = null } = {}) {
  const role = normalizeRole(user.role);
  const roleAllowedPages = pagesForRole(role);
  const lockedPages = [];
  const unlockedPages = [];
  const pageLocks = {};

  for (const page of roleAllowedPages) {
    const result = planAllowsPage({ page, plan, user });
    if (result.allowed) {
      unlockedPages.push(page);
    } else {
      lockedPages.push(page);
      pageLocks[page] = {
        page,
        reason: result.reason,
        upgradeUrl: result.upgradeUrl,
        billingUrl: result.billingUrl,
        planSlug: plan?.slug || user.plan || 'free-trial',
        planName: plan?.name || user.plan || 'Free Trial'
      };
    }
  }

  return {
    role,
    planSlug: plan?.slug || user.plan || 'free-trial',
    planName: plan?.name || 'Free Trial',
    isSuperadmin: role === 'super_admin',
    roleAllowedPages,
    allowedPages: unlockedPages,
    unlockedPages,
    lockedPages,
    visiblePages: roleAllowedPages,
    pageLocks,
    capabilities: roleCapabilities(role, roleAllowedPages),
    features: { ...DEFAULT_PLAN_FEATURES, ...(plan?.features || {}) },
    limits: plan?.limits || {}
  };
}

function resolveDashboardPageForAccess({ page, featureAccess }) {
  const requested = normalizePage(page);
  if (!DASHBOARD_PAGES.includes(requested)) return 'overview';
  const roleAllowed = new Set(featureAccess?.roleAllowedPages || []);
  if (requested !== 'overview' && roleAllowed.size && !roleAllowed.has(requested)) return 'overview';
  return requested;
}

module.exports = {
  DASHBOARD_PAGES,
  PAGE_ALIASES,
  DEFAULT_PLAN_FEATURES,
  PAGE_REQUIREMENTS,
  ROLE_PAGE_ACCESS,
  buildFeatureAccess,
  isAdminRole,
  normalizePage,
  normalizeRole,
  pagesForRole,
  planAllowsPage,
  resolveDashboardPageForAccess,
  roleCapabilities
};

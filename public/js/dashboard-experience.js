const body = document.body;
const themeToggle = document.getElementById('themeToggle');
const themeToggleMenu = document.getElementById('themeToggleMenu');
const openDrawer = document.getElementById('openDrawer');
const closeDrawer = document.getElementById('closeDrawer');
const sidebar = document.getElementById('sidebar');
const drawerBackdrop = document.getElementById('drawerBackdrop');
const pageTitle = document.getElementById('pageTitle');
const pageRoot = document.getElementById('pageRoot');
const searchInput = document.getElementById('searchInput');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose = document.getElementById('modalClose');
const modalKicker = document.getElementById('modalKicker');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalActions = document.getElementById('modalActions');
const liveData = window.__AUTOBRAND_DASHBOARD_DATA__ || {};
const livePages = liveData.pages || {};
const currentUser = liveData.user || {};
const brandRecords = liveData.options?.brandRecords || [];
const dashboardBrands = liveData.options?.brands || [];
const dashboardSocialAccounts = liveData.options?.socialAccounts || [];
const dashboardCalendar = liveData.options?.calendar || { days: [], posts: [], weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const dashboardAdminPlans = Array.isArray(liveData.options?.adminPlans) ? liveData.options.adminPlans : [];
const dashboardPublicPlans = Array.isArray(liveData.options?.publicPricingPlans) ? liveData.options.publicPricingPlans : [];
const dashboardCsrfToken = liveData.csrfToken || '';
const dashboardBasePath = '/dashboard';
const dashboardTimeZone = liveData.timeZone || 'Africa/Kampala';
const roleAccess = liveData.roleAccess || {};
const currentPlan = liveData.currentPlan || {};
const isStaticDashboardErrorPage = Boolean(liveData.isErrorPage);
const pageLocks = roleAccess.pageLocks || liveData.featureAccess?.pageLocks || {};
const pageAliases = {
  'post-editor': 'content-library',
  posts: 'content-library',
  drafts: 'content-library',
  roles: 'team',
  users: 'team',
  'content-generator': 'quick-create',
  'ai-generator': 'quick-create',
  'ai': 'quick-create',
  calendar_old: 'calendar',
  billings: 'billing',
  templates: 'video-system',
  'image-workflows': 'media',
  'growth-studio': 'campaigns',
  'avatar-consent': 'avatar-video',
  'auto-handoff': 'approvals',
  handoff: 'approvals',
  integrations: 'social',
  'google-business': 'social',
  pinterest: 'social',
  x: 'social',
  twitter: 'social',
  threads: 'social',
  whatsapp: 'social',
  security: 'settings',
  'admin-plans': 'plans',
  'admin/plans': 'plans'
};
function aliasPageId(pageId = '') {
  const raw = String(pageId || '').replace(/^\/dashboard\/?/, '').split('?')[0].split('#')[0].split('/')[0] || liveData.initialPage || 'overview';
  return pageAliases[raw] || raw || 'overview';
}
const unlockedPageList = Array.isArray(roleAccess.unlockedPages) && roleAccess.unlockedPages.length
  ? roleAccess.unlockedPages.map(aliasPageId)
  : Array.isArray(roleAccess.allowedPages) && roleAccess.allowedPages.length
    ? roleAccess.allowedPages.map(aliasPageId)
    : Array.isArray(roleAccess.visiblePages) && roleAccess.visiblePages.length
      ? roleAccess.visiblePages.map(aliasPageId)
      : [];
const roleAllowedPageList = Array.isArray(roleAccess.visiblePages) && roleAccess.visiblePages.length
  ? roleAccess.visiblePages.map(aliasPageId)
  : unlockedPageList;
const lockedPageList = Array.isArray(roleAccess.lockedPages) ? roleAccess.lockedPages.map(aliasPageId) : [];
let allowedPageSet = new Set(unlockedPageList.filter(Boolean));
if (!allowedPageSet.size) allowedPageSet = null;
const unlockedPageSet = new Set(unlockedPageList.filter(Boolean));
const lockedPageSet = new Set(lockedPageList.filter(Boolean));
function isAllowedPage(pageId) {
  const resolved = aliasPageId(pageId);
  return resolved === 'overview' || !allowedPageSet || allowedPageSet.has(resolved);
}
function isLockedPage(pageId) {
  const resolved = aliasPageId(pageId);
  return resolved !== 'overview' && lockedPageSet.has(resolved) && !unlockedPageSet.has(resolved);
}
function lockInfo(pageId) {
  const resolved = aliasPageId(pageId);
  return pageLocks[resolved] || { reason: 'Upgrade or ask an admin to unlock this feature.', billingUrl: '/dashboard/billing', upgradeUrl: '/pricing', planName: currentPlan.name || roleAccess.planName || 'Current plan' };
}
const generatedLabel = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
  new Date(liveData.generatedAt || Date.now())
);

function dashboardTodayKey(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: dashboardTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date).reduce((map, part) => {
      if (part.type !== 'literal') map[part.type] = part.value;
      return map;
    }, {});
    if (parts.year && parts.month && parts.day) return `${parts.year}-${parts.month}-${parts.day}`;
  } catch (error) {
    // Fall back to the browser date if Intl timezone formatting is unavailable.
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value = '') {
  const text = String(value || '');
  return /^https?:\/\//i.test(text) ? escapeHtml(text) : '';
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

const dashboardNoticeCatalog = {
  activated: { kind: 'success', title: 'Plan activated', message: 'Your plan is active and billing usage has been refreshed.' },
  pending: { kind: 'warning', title: 'Payment pending', message: 'We are waiting for the payment provider to confirm this transaction.' },
  failed: { kind: 'error', title: 'Payment failed', message: 'The payment provider marked this transaction as failed.' },
  cancelled: { kind: 'warning', title: 'Checkout cancelled', message: 'Checkout was cancelled before the plan changed.' },
  accepted: { kind: 'success', title: 'Invitation accepted', message: 'The workspace invitation was accepted successfully.' },
  diagnostics: { kind: 'success', title: 'Diagnostics complete', message: 'Provider diagnostics finished and the latest results are available.' },
  retry_scheduled: { kind: 'warning', title: 'Retry scheduled', message: 'The failed post was queued for another publish attempt.' },
  facebook_setup: { kind: 'warning', title: 'Facebook setup needed', message: 'Add Meta app credentials before starting this connection.' },
  google_business_setup: { kind: 'warning', title: 'Google Business setup needed', message: 'Add Google Business credentials before starting this connection.' }
};
const dashboardNoticeMessages = {
  meta_connected: { kind: 'success', title: 'Meta connected', message: 'Facebook and Instagram accounts were connected.' },
  google_business_connected: { kind: 'success', title: 'Google Business connected', message: 'Google Business Profile accounts were connected.' },
  pinterest_connected: { kind: 'success', title: 'Pinterest connected', message: 'Pinterest account connected successfully.' },
  tiktok_connected: { kind: 'success', title: 'TikTok connected', message: 'TikTok account connected successfully.' },
  threads_connected: { kind: 'success', title: 'Threads connected', message: 'Threads account connected successfully.' },
  x_connected: { kind: 'success', title: 'X connected', message: 'X account connected successfully.' },
  youtube_connected: { kind: 'success', title: 'YouTube connected', message: 'YouTube account connected successfully.' },
  linkedin_connected: { kind: 'success', title: 'LinkedIn connected', message: 'LinkedIn account connected successfully.' },
  tiktok_synced: { kind: 'success', title: 'TikTok synced', message: 'TikTok account details were refreshed.' },
  updated: { kind: 'success', title: 'Updated', message: 'The record was updated successfully.' },
  disconnected: { kind: 'warning', title: 'Disconnected', message: 'The account was disconnected from publishing.' },
  reconnected: { kind: 'success', title: 'Reconnected', message: 'The account was reconnected and checked.' },
  not_tiktok: { kind: 'warning', title: 'Wrong account type', message: 'Choose a TikTok account before syncing TikTok data.' }
};

function humanizeNotice(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return 'Your update was saved.';
  if (/[\s.,!?]/.test(raw)) return raw;
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dashboardNoticeFromQuery(searchParams = new URLSearchParams()) {
  const errorKeys = ['error', 'facebook_error', 'google_business_error', 'pinterest_error', 'tiktok_error', 'threads_error', 'x_error', 'youtube_error', 'linkedin_error'];
  const errorMessage = errorKeys.map((key) => searchParams.get(key)).find(Boolean);
  if (errorMessage) {
    return { kind: 'error', title: 'Action needs attention', message: errorMessage };
  }

  const noticeValue = searchParams.get('notice');
  if (noticeValue) {
    const noticeKey = String(noticeValue).trim();
    if (dashboardNoticeMessages[noticeKey]) return dashboardNoticeMessages[noticeKey];
    if (noticeKey.startsWith('health_')) {
      return { kind: 'warning', title: 'Account health updated', message: `Latest status: ${humanizeNotice(noticeKey.replace(/^health_/, ''))}.` };
    }
    return { kind: 'success', title: 'Update complete', message: humanizeNotice(noticeValue) };
  }

  const handoffCreatedCount = searchParams.get('handoff_created');
  if (handoffCreatedCount) {
    return {
      kind: 'success',
      title: 'Schedule created',
      message: `${handoffCreatedCount} real post${handoffCreatedCount === '1' ? '' : 's'} scheduled.`
    };
  }

  const bulkRescheduledCount = searchParams.get('bulk_rescheduled');
  if (bulkRescheduledCount) {
    return {
      kind: 'success',
      title: 'Posts rescheduled',
      message: `${bulkRescheduledCount} post${bulkRescheduledCount === '1' ? '' : 's'} moved on the calendar.`
    };
  }

  const flagKey = Object.keys(dashboardNoticeCatalog).find((key) => searchParams.has(key));
  return flagKey ? dashboardNoticeCatalog[flagKey] : null;
}

function dashboardNoticeMarkup(notice) {
  if (!notice) return '';
  return `<article class="dashboard-notice ${escapeHtml(notice.kind || 'info')}"><strong>${escapeHtml(notice.title || 'Update')}</strong><span>${escapeHtml(notice.message || '')}</span></article>`;
}

function templateHtml(pageId) {
  const template = document.getElementById(`dashboard-form-${pageId}`);
  return template ? template.innerHTML : '';
}

function iconForTag(value = '') {
  const key = String(value || '').replace(/_/g, '-').toLowerCase();
  if (key.includes('facebook') || key === 'fb') return icon('facebook');
  if (key.includes('instagram') || key === 'ig') return icon('instagram');
  if (key.includes('linkedin') || key === 'li') return icon('linkedin');
  if (key.includes('youtube') || key === 'yt' || key.includes('short')) return icon('youtube');
  if (key.includes('tiktok') || key === 'tt' || key.includes('reel')) return icon('tiktok');
  if (key.includes('whatsapp') || key.includes('local')) return icon('whatsapp');
  if (key.includes('google-business') || key.includes('google_business')) return icon('google_business');
  if (key.includes('pinterest')) return icon('pinterest');
  if (key === 'x' || key.includes('twitter')) return icon('x_platform');
  if (key.includes('threads')) return icon('threads');
  if (key.includes('brand') || key.includes('brain')) return icon('brain');
  if (key.includes('calendar') || key.includes('schedule') || key.includes('scheduled')) return icon('calendar');
  if (key.includes('publish') || key.includes('post') || key.includes('content') || key.includes('draft')) return icon('send');
  if (key.includes('approval') || key.includes('approved') || key.includes('review')) return icon('check');
  if (key.includes('campaign') || key.includes('growth')) return icon('chart');
  if (key.includes('template')) return icon('template');
  if (key.includes('user') || key.includes('team') || key.includes('role') || key.includes('member')) return icon('users');
  if (key.includes('billing') || key.includes('payment') || key.includes('subscription') || key.includes('credit')) return icon('card');
  if (key.includes('security') || key.includes('audit') || key.includes('admin')) return icon('shield');
  if (key.includes('integration') || key.includes('api') || key.includes('connect') || key.includes('account')) return icon('plug');
  if (key.includes('notification') || key.includes('message') || key.includes('whatsapp')) return icon('message');
  if (key.includes('setting')) return icon('settings');
  if (key.includes('avatar') || key.includes('consent')) return icon('avatar');
  if (key.includes('video')) return icon('play');
  if (key.includes('image') || key.includes('media') || key.includes('carousel') || key.includes('slide')) return icon('image');
  if (key.includes('failed') || key.includes('cancel')) return icon('x');
  return icon('grid');
}

function cardIcon(card = {}) {
  return iconForTag(card.tag || card.status || card.kind || card.title || 'record');
}

function platformIconName(platform = '') {
  if (platform === 'x') return 'x_platform';
  if (['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'google_business', 'pinterest', 'threads'].includes(platform)) return platform;
  return 'plug';
}

function instagramLogoMark(label = 'Instagram') {
  return `<span class="social-logo social-logo-instagram" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
    <svg class="instagram-mark" viewBox="0 0 24 24" role="img" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="4.2"></rect>
      <circle cx="12" cy="12" r="3.25"></circle>
      <circle cx="16.35" cy="7.65" r="1.15"></circle>
    </svg>
    <span class="social-logo-fallback">IG</span>
  </span>`;
}

function platformIcon(platform = '') {
  const safePlatform = escapeHtml(platform);
  const label = String(platform || '').replace(/_/g, ' ') || 'platform';
  if (String(platform || '').toLowerCase() === 'instagram') return instagramLogoMark(label);
  return `<span class="social-logo social-logo-${safePlatform}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon(platformIconName(platform))}<span class="social-logo-fallback">${escapeHtml(label.slice(0, 2).toUpperCase())}</span></span>`;
}

const routeMap = {
  overview: { primary: '/dashboard/quick-create', secondary: '/dashboard/content-library', view: '/dashboard/overview', label: 'Create post' },
  'quick-create': { primary: '/dashboard/quick-create', secondary: '/dashboard/content-library', view: '/dashboard/quick-create', label: 'Full composer' },
  team: { primary: '/dashboard/team', secondary: '/dashboard/team', view: '/dashboard/team', label: 'Invite team' },
  'brand-brain': { primary: '/dashboard/brand-brain?mode=create', secondary: '/dashboard/quick-create', view: '/dashboard/brand-brain', label: 'New brand' },
  'content-library': { primary: '/dashboard/quick-create', secondary: '/dashboard/calendar', view: '/dashboard/content-library', label: 'Full composer' },
  campaigns: { primary: '/dashboard/campaigns', secondary: '/dashboard/quick-create', view: '/dashboard/campaigns', label: 'Campaigns' },
  media: { primary: '/dashboard/media', secondary: '/dashboard/quick-create', view: '/dashboard/media', label: 'Media library' },
  'video-system': { primary: '/dashboard/video-system', secondary: '/dashboard/quick-create', view: '/dashboard/video-system', label: 'Video studio' },
  'avatar-video': { primary: '/dashboard/avatar-video', secondary: '/dashboard/video-system', view: '/dashboard/avatar-video', label: 'Avatar video' },
  calendar: { primary: '/dashboard/quick-create', secondary: '/dashboard/content-library', view: '/dashboard/calendar', label: 'Full composer' },
  social: { primary: '/dashboard/social', secondary: '/dashboard/content-library', view: '/dashboard/social', label: 'Social APIs' },
  approvals: { primary: '/dashboard/quick-create', secondary: '/dashboard/calendar', view: '/dashboard/approvals', label: 'Full composer' },
  analytics: { primary: '/dashboard/analytics/export.csv', secondary: '/dashboard/content-library', view: '/dashboard/analytics', label: 'Export CSV' },
  notifications: { primary: '/dashboard/notifications', secondary: '/dashboard/content-library', view: '/dashboard/notifications', label: 'Notifications' },
  billing: { primary: '/dashboard/billing', secondary: '/dashboard/settings', view: '/dashboard/billing', label: 'Billing' },
  plans: { primary: '/dashboard/plans?mode=create', secondary: '/dashboard/billing', view: '/dashboard/plans', label: 'Create plan' },
  admin: { primary: '/dashboard/plans', secondary: '/dashboard/settings', view: '/dashboard/admin', label: 'Manage plans' },
  settings: { primary: '/dashboard/settings', secondary: '/dashboard/team', view: '/dashboard/settings', label: 'Settings' },
  errors: { primary: '/dashboard/overview', secondary: '/dashboard/settings', view: '/dashboard/errors', label: 'Dashboard' }
};

const socialPlatforms = [
  { key: 'facebook', name: 'Facebook Pages', shortName: 'Facebook', description: 'Connect Pages through Meta and publish directly.', kind: 'oauth', primaryAction: 'Connect Meta' },
  { key: 'instagram', name: 'Instagram Business', shortName: 'Instagram', description: 'Publish images, carousels, and reels to linked Instagram Business accounts.', kind: 'oauth', primaryAction: 'Open Meta' },
  { key: 'google_business', name: 'Google Business Profile', shortName: 'Google Profile', description: 'Publish local updates, offers, and announcements to Search and Maps.', kind: 'oauth', primaryAction: 'Open Google' },
  { key: 'linkedin', name: 'LinkedIn Profile / Page', shortName: 'LinkedIn', description: 'Publish professional updates to a LinkedIn profile or organization Page.', kind: 'oauth', primaryAction: 'Open LinkedIn' },
  { key: 'pinterest', name: 'Pinterest Board', shortName: 'Pinterest', description: 'Publish campaign images as pins on selected boards.', kind: 'oauth', primaryAction: 'Open Pinterest' },
  { key: 'tiktok', name: 'TikTok Account', shortName: 'TikTok', description: 'Connect TikTok with OAuth and publish short-form videos.', kind: 'oauth', primaryAction: 'Open TikTok' },
  { key: 'youtube', name: 'YouTube Shorts', shortName: 'YouTube', description: 'Connect with Google OAuth and upload short-form videos.', kind: 'oauth', primaryAction: 'Open YouTube' },
  { key: 'x', name: 'X / Twitter', shortName: 'X', description: 'Publish short posts and campaign updates to X.', kind: 'oauth', primaryAction: 'Open X' },
  { key: 'threads', name: 'Threads', shortName: 'Threads', description: 'Publish conversation-first posts to Threads.', kind: 'oauth', primaryAction: 'Open Threads' }
];

const savedTheme = localStorage.getItem('autoBrandDashboardTheme');
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  body.classList.add('dark-mode');
}
function syncThemeIcon() {
  const isDark = body.classList.contains('dark-mode');
  if (themeToggle) themeToggle.setAttribute('aria-label', isDark ? 'Use light mode' : 'Use dark mode');
  if (themeToggleMenu) {
    const menuLabel = themeToggleMenu.querySelector('strong');
    if (menuLabel) menuLabel.textContent = isDark ? 'Light mode' : 'Dark mode';
  }
}
function toggleTheme() {
  body.classList.toggle('dark-mode');
  localStorage.setItem('autoBrandDashboardTheme', body.classList.contains('dark-mode') ? 'dark' : 'light');
  syncThemeIcon();
}
if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
if (themeToggleMenu) themeToggleMenu.addEventListener('click', toggleTheme);
syncThemeIcon();

function showDrawer() {
  sidebar.classList.add('open');
  drawerBackdrop.classList.add('show');
}
function hideDrawer() {
  sidebar.classList.remove('open');
  drawerBackdrop.classList.remove('show');
}
openDrawer.addEventListener('click', showDrawer);
closeDrawer.addEventListener('click', hideDrawer);
drawerBackdrop.addEventListener('click', hideDrawer);

const pageMeta = {
  overview: {
    title: 'Dashboard',
    kicker: 'Command center',
    heading: 'Manage AI content, campaigns and approvals.',
    description: 'A live overview of database records, publishing health, approvals and useful next actions.'
  },
  'quick-create': {
    title: 'Quick Create', kicker: 'AI assistant', heading: 'Create campaign assets faster.',
    description: 'Generate a real post draft from Brand Brain, connected accounts and saved media.'
  },
  'auto-handoff': {
    title: 'Auto Handoff', kicker: 'Automation', heading: 'Turn Brand Brain into scheduled content.',
    description: 'Configure automatic handoff using real brands, connected accounts and saved posting rules.'
  },
  roles: {
    title: 'Role Views', kicker: 'Access control', heading: 'Role-based workspace views.',
    description: 'Review real invited and active team members, roles and permissions.'
  },
  team: {
    title: 'Team', kicker: 'Access control', heading: 'Invite and manage real team members.',
    description: 'Use the existing team backend from the clean dashboard with live member records.'
  },
  users: {
    title: 'Users', kicker: 'Access control', heading: 'Users, roles and permissions.',
    description: 'Invite, review and manage real workspace users from the shared dashboard. Visible features follow each user role.'
  },
  'brand-brain': {
    title: 'Brand Brain', kicker: 'Brand memory', heading: 'Central intelligence for each brand.',
    description: 'Store real audience, offers, products, voice, rules and local business data for each brand.'
  },
  'content-library': {
    title: 'Content Library', kicker: 'Posts', heading: 'Review real saved posts.',
    description: 'Drafts, scheduled posts, published posts and failures pulled from the Post collection.'
  },
  'content-generator': {
    title: 'Content Generator', kicker: 'Content studio', heading: 'Generate platform-ready content.',
    description: 'Create real drafts, captions, media plans and platform variants using Brand Brain.'
  },
  'ai-generator': {
    title: 'AI Generator', kicker: 'Old tools restored', heading: 'Use the full AI generator tools.',
    description: 'Generate real posts, hashtag packs, video scripts and campaign plans from saved brand data.'
  },
  campaigns: {
    title: 'Campaign Generator', kicker: 'Campaign planning', heading: 'Plan campaigns from goal to calendar.',
    description: 'Create and review real campaign records, statuses and AI plans.'
  },
  templates: {
    title: 'Templates', kicker: 'Reusable systems', heading: 'Campaign templates for faster work.',
    description: 'Open real templates and render records from the template system.'
  },
  'image-workflows': {
    title: 'Image Workflows', kicker: 'Creative', heading: 'Image generation and editing workflows.',
    description: 'Use real media assets and saved brand data for image workflows.'
  },
  media: {
    title: 'Media Library', kicker: 'Assets', heading: 'Manage uploaded and generated media.',
    description: 'Review real media assets, consent states and linked brands.'
  },
  'growth-studio': {
    title: 'Growth Studio', kicker: 'Growth', heading: 'Run growth actions on real brands.',
    description: 'Campaign briefs, drafts, audits, storyboards and offer angles backed by saved GrowthAsset records.'
  },
  'video-system': {
    title: 'Video System', kicker: 'Video', heading: 'Template, clean AI and scene-based video.',
    description: 'Review real AI video jobs, renders and source media.'
  },
  'avatar-video': {
    title: 'Avatar Video', kicker: 'Premium', heading: 'Consent-protected avatar video.',
    description: 'Create avatar videos only from real consented avatar profiles and owner media.'
  },
  'avatar-consent': {
    title: 'Avatar Consent', kicker: 'Safety', heading: 'Register consented avatar profiles.',
    description: 'Create and track real avatar profiles before using owner likeness workflows.'
  },
  calendar: {
    title: 'Calendar', kicker: 'Scheduling', heading: 'Plan and schedule content.',
    description: 'Monthly calendar built from real scheduled, published, cancelled and failed Post records.'
  },
  social: {
    title: 'Social Posting', kicker: 'Publishing', heading: 'Connect and publish safely.',
    description: 'OAuth accounts, token health and channel previews from real SocialAccount records.'
  },
  approvals: {
    title: 'Approvals', kicker: 'Review', heading: 'Client and team approvals.',
    description: 'Approve, reject, comment and track real Approval records before publishing.'
  },
  analytics: {
    title: 'Analytics', kicker: 'Insights', heading: 'Track what works.',
    description: 'Live analytics totals, platform records and content performance pulled from your database.'
  },
  notifications: {
    title: 'Notifications', kicker: 'Alerts', heading: 'Stay on top of workspace events.',
    description: 'Real notifications for publishing, approvals and account issues.'
  },
  billing: {
    title: 'Billing & Credits', kicker: 'Admin', heading: 'Billing, credits and plan usage.',
    description: 'Review real subscription, payment and usage records.'
  },
  security: {
    title: 'Security', kicker: 'Security', heading: 'Secure platform foundation.',
    description: 'Account status, token alerts and audit logs from the existing security workflow.'
  },
  integrations: {
    title: 'Integrations', kicker: 'API', heading: 'Connect social, creative and payment tools.',
    description: 'Review real OAuth accounts, API logs and provider connection status.'
  },
  settings: {
    title: 'Settings', kicker: 'Workspace', heading: 'Control account and workspace preferences.',
    description: 'Manage real workspace settings, provider diagnostics and saved defaults.'
  },
  admin: {
    title: 'Admin', kicker: 'Operations', heading: 'Admin console records.',
    description: 'Failed posts, API logs, audit events and operational records from the database.'
  },
  plans: {
    title: 'Plan Management', kicker: 'Plans', heading: 'Manage subscription plans inside the dashboard.',
    description: 'Create, edit, duplicate, reorder, publish and archive dynamic plans from the same dashboard design.'
  },
  errors: {
    title: 'Dashboard Error', kicker: 'Hidden page', heading: 'Something needs attention.',
    description: 'This hidden dashboard page appears only when the app needs to show an error state.'
  }
};

const defaultPage = {
  title: 'Dashboard',
  kicker: 'Command center',
  heading: 'Manage AI content, campaigns and approvals.',
  description: 'A live overview of database records, publishing health, approvals and useful next actions.',
  stats: [],
  cards: [],
  rows: [],
  tableRows: [],
  form: false
};

function safeLivePage(pageId) {
  const candidate = livePages && typeof livePages[pageId] === 'object' && livePages[pageId] !== null
    ? livePages[pageId]
    : {};
  return Array.isArray(candidate) ? {} : candidate;
}

function normalizeRecordCard(record, index = 0) {
  if (record === null || record === undefined) return null;
  if (Array.isArray(record)) {
    const title = record[0] ?? 'Untitled record';
    const description = record[1] ?? '';
    const tag = record[2] ?? 'Record';
    return {
      id: '',
      kind: 'record',
      title,
      description,
      tag,
      status: tag,
      href: '',
      editHref: '',
      editAction: '',
      editMethod: '',
      editFields: [],
      actionHref: '',
      actionLabel: '',
      actionMethod: '',
      actions: [],
      deleteAction: '',
      deleteLabel: '',
      deleteMethod: '',
      mediaUrl: '',
      mediaType: '',
      mediaAlt: title,
      media: [],
      details: { Title: title, Description: description, Status: tag },
      index
    };
  }
  if (typeof record === 'object') {
    const title = record.title || record.name || record.accountName || record.fileName || 'Untitled record';
    const description = record.description || record.text || record.caption || record.summary || record.message || '';
    const tag = record.tag || record.status || record.type || record.kind || 'Record';
    const details = record.details && typeof record.details === 'object'
      ? record.details
      : { Title: title, Description: description, Status: tag };
    const firstMedia = Array.isArray(record.media) ? record.media.find((item) => item?.url || item?.fileUrl) : null;
    return {
      id: record.id || record._id || '',
      kind: record.kind || record.type || 'record',
      title,
      description,
      tag,
      status: record.status || tag,
      href: record.href || record.viewHref || record.url || '',
      editHref: record.editHref || record.editUrl || '',
      editAction: record.editAction || '',
      editMethod: record.editMethod || '',
      editFields: Array.isArray(record.editFields) ? record.editFields : [],
      actionHref: record.actionHref || '',
      actionLabel: record.actionLabel || '',
      actionMethod: record.actionMethod || '',
      actions: Array.isArray(record.actions) ? record.actions : [],
      deleteAction: record.deleteAction || '',
      deleteLabel: record.deleteLabel || '',
      deleteMethod: record.deleteMethod || '',
      mediaUrl: record.mediaUrl || firstMedia?.url || firstMedia?.fileUrl || '',
      mediaType: record.mediaType || firstMedia?.type || firstMedia?.fileType || '',
      mediaAlt: record.mediaAlt || record.fileName || title,
      media: Array.isArray(record.media) ? record.media.map((item) => ({
        id: item?.id || item?._id || '',
        title: item?.title || item?.name || item?.fileName || 'Media',
        url: item?.url || item?.fileUrl || item?.mediaUrl || '',
        type: item?.type || item?.fileType || '',
        alt: item?.alt || item?.mediaAlt || item?.title || item?.name || 'Media'
      })).filter((item) => item.url) : [],
      details,
      raw: record.raw || null,
      index
    };
  }
  return {
    id: '',
    kind: 'record',
    title: String(record),
    description: '',
    tag: 'Record',
    status: 'Record',
    href: '',
    editHref: '',
    editAction: '',
    editMethod: '',
    editFields: [],
    actionHref: '',
    actionLabel: '',
    actionMethod: '',
    actions: [],
    deleteAction: '',
    deleteLabel: '',
    deleteMethod: '',
    mediaUrl: '',
    mediaType: '',
    mediaAlt: String(record),
    media: [],
    details: { Title: String(record) },
    index
  };
}

function normalizeCards(cards = []) {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((record, index) => normalizeRecordCard(record, index))
    .filter(Boolean);
}

function rowFromRecord(row) {
  if (Array.isArray(row)) return [row[0] ?? 'Untitled record', row[1] ?? '', row[2] ?? 'Record'];
  if (typeof row === 'object' && row) {
    const card = normalizeRecordCard(row);
    return [card.title, card.description, card.status || card.tag || 'Record'];
  }
  return [String(row), '', 'Record'];
}

function normalizeRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row !== null && row !== undefined)
    .map(rowFromRecord);
}

function buildPage(pageId, meta = defaultPage) {
  const livePage = safeLivePage(pageId);
  const rows = normalizeRows(livePage.rows);
  const cards = normalizeCards(livePage.cards);
  const tableRows = normalizeRows(livePage.tableRows).length ? normalizeRows(livePage.tableRows) : (rows.length ? rows : normalizeRows(cards));
  return {
    ...defaultPage,
    ...meta,
    ...livePage,
    title: livePage.title || meta.title || defaultPage.title,
    kicker: livePage.kicker || meta.kicker || defaultPage.kicker,
    heading: livePage.heading || meta.heading || defaultPage.heading,
    description: livePage.description || meta.description || defaultPage.description,
    stats: normalizeRows(livePage.stats),
    cards,
    rows,
    tableRows,
    form: Boolean(livePage.form)
  };
}

const pages = Object.keys(pageMeta).reduce((map, pageId) => {
  map[pageId] = buildPage(pageId, pageMeta[pageId]);
  return map;
}, {});
if (!pages.overview) pages.overview = buildPage('overview', pageMeta.overview || defaultPage);

let navLinks = Array.from(document.querySelectorAll('[data-page]'));
navLinks.forEach((link) => {
  const resolved = aliasPageId(link.dataset.page || link.getAttribute('href') || 'overview');
  if (!Object.prototype.hasOwnProperty.call(pages, resolved) || !isAllowedPage(resolved)) {
    link.remove();
    return;
  }
  link.dataset.page = resolved;
  link.setAttribute('href', pagePath(resolved));
  if (isLockedPage(resolved)) {
    link.classList.add('is-locked');
    link.setAttribute('aria-label', `${link.textContent.trim()} locked on current plan`);
    const badge = link.querySelector('b');
    if (badge) badge.textContent = 'Locked';
  }
});
navLinks = navLinks.filter((link) => link.isConnected);
let currentPage = 'overview';

function normalizePageId(pageId) {
  const resolved = aliasPageId(pageId);
  return Object.prototype.hasOwnProperty.call(pages, resolved) && isAllowedPage(resolved) ? resolved : 'overview';
}

function getPage(pageId = currentPage) {
  const safePageId = normalizePageId(pageId);
  return { pageId: safePageId, page: pages[safePageId] || pages.overview || defaultPage };
}

function currentPageTitle() {
  return getPage(currentPage).page.title || defaultPage.title;
}

function pagePath(pageId) {
  return `${dashboardBasePath}/${normalizePageId(pageId)}`;
}

function pageFromLocation() {
  if (isStaticDashboardErrorPage && liveData.initialPage) return normalizePageId(liveData.initialPage);
  return normalizePageId(location.pathname || liveData.initialPage || 'overview');
}

function actionButtons(title) {
  if (isLockedPage(currentPage)) {
    const info = lockInfo(currentPage);
    return `<div class="page-actions"><a class="btn btn-primary" href="${escapeHtml(info.billingUrl || '/dashboard/billing')}">${icon('card')}Upgrade</a><a class="btn btn-ghost" href="${escapeHtml(info.upgradeUrl || '/pricing')}">Compare plans</a></div>`;
  }
  const routes = routeMap[currentPage] || routeMap.overview;
  const routePage = (href) => aliasPageId(String(href || '').replace('/dashboard/', ''));
  const primaryHref = String(routes.primary || '');
  const isDashboardActionHref = primaryHref.startsWith('/dashboard/actions/');
  const isDashboardExportHref = primaryHref.startsWith('/dashboard/analytics/export.csv');
  const safePrimary = routes.primary && routes.primary !== '#' && !isDashboardActionHref && !isDashboardExportHref && !isAllowedPage(routePage(routes.primary)) ? pagePath('overview') : routes.primary;
  const primary = routes.modalAction
    ? `<button class="btn btn-primary" type="button" data-action="${routes.modalAction}">${icon('plus')}${escapeHtml(routes.label || 'Create')}</button>`
    : `<a class="btn btn-primary" href="${escapeHtml(safePrimary || pagePath(currentPage))}">${icon('plus')}${escapeHtml(routes.label || 'Open')}</a>`;
  const relatedPage = routePage(routes.secondary || '');
  const related = routes.secondary && routes.secondary !== routes.view && isAllowedPage(relatedPage)
    ? `<a class="btn btn-ghost" href="${pagePath(relatedPage)}">Related</a>`
    : '';
  return `<div class="page-actions">${primary}${related}</div>`;
}

function renderStats(stats = []) {
  return `<div class="stats-grid">${stats.map(([num, label, meta]) => `
    <article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(num)}</strong><small>${escapeHtml(meta)}</small></article>
  `).join('')}</div>`;
}

function analyticsChart(title, rows = [], labelKey = 'label') {
  const safeRows = Array.isArray(rows) ? rows : [];
  const maxValue = Math.max(1, ...safeRows.map((row) => Number(row.value || 0)));
  return `<article class="analytics-chart">
    <div class="card-head"><div><h3>${escapeHtml(title)}</h3><p>Performance compared by ${escapeHtml(labelKey.replace(/_/g, ' '))}.</p></div><span class="badge">${escapeHtml(safeRows.length)} rows</span></div>
    <div class="analytics-bars">
      ${safeRows.length ? safeRows.map((row) => {
        const label = row[labelKey] || row.label || row.platform || row.time || row.campaign || 'Unknown';
        const value = Number(row.value || 0);
        const width = Math.max(6, Math.round((value / maxValue) * 100));
        return `<div class="analytics-bar-row">
          <span>${escapeHtml(label)}</span>
          <div class="analytics-bar-track"><i style="width:${width}%"></i></div>
          <strong>${escapeHtml(value)}<small>${row.engagementRate ? ` - ${Number(row.engagementRate).toFixed(2)}%` : ''}</small></strong>
        </div>`;
      }).join('') : '<p class="empty-state">No analytics data yet.</p>'}
    </div>
  </article>`;
}

function renderAnalyticsDashboard(page = {}) {
  const charts = page.charts || {};
  const recommendations = Array.isArray(page.recommendations) ? page.recommendations : [];
  return `${templateHtml('analytics')}
    <section class="analytics-dashboard-grid">
      ${analyticsChart('Platform performance', charts.platforms || [], 'platform')}
      ${analyticsChart('Best times', charts.times || [], 'time')}
      ${analyticsChart('Campaign performance', charts.campaigns || [], 'campaign')}
      <article class="analytics-chart analytics-recommendations">
        <div class="card-head"><div><h3>Content recommendations</h3><p>Generated from post, campaign and account metrics.</p></div><a class="badge" href="${escapeHtml(page.exportUrl || '/dashboard/analytics/export.csv')}">CSV</a></div>
        ${recommendations.length
          ? `<ul class="record-detail-list">${recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
          : '<p class="empty-state">Recommendations appear after posts have analytics.</p>'}
      </article>
    </section>
    <article class="card"><div class="card-head"><div><h3>Analytics records</h3><p>Post, campaign, account and recommendation cards from current performance data.</p></div><span class="badge">${escapeHtml(page.cards?.length || 0)} items</span></div>${renderCards(page.cards)}</article>
    ${renderRows(page.rows)}
    ${renderTable(page)}`;
}

function isVideoMedia(card = {}) {
  const type = String(card.mediaType || card.type || '').toLowerCase();
  const url = String(card.mediaUrl || '').toLowerCase().split('?')[0];
  return type.includes('video') || /\.(mp4|mov|webm|m4v)$/.test(url);
}

function isImageMedia(card = {}) {
  const type = String(card.mediaType || '').toLowerCase();
  const url = String(card.mediaUrl || '').toLowerCase().split('?')[0];
  return type.includes('image') || /\.(png|jpe?g|webp|gif|avif)$/.test(url);
}

function cardMedia(card, index, context = 'card') {
  const safeTitle = escapeHtml(card.title || 'Record');
  const safeTag = escapeHtml(card.tag || card.status || 'Record');
  const firstMediaItem = contentLibraryMediaItems(card)[0] || {};
  const mediaUrl = card.mediaUrl || firstMediaItem.url || '';
  const mediaCard = { ...card, mediaUrl, mediaType: card.mediaType || firstMediaItem.type || '', mediaAlt: card.mediaAlt || firstMediaItem.alt || card.title };
  if (mediaUrl && isVideoMedia(mediaCard)) {
    return `<div class="card-media card-video" aria-label="${safeTitle} video">
      <video src="${escapeHtml(mediaUrl)}" controls preload="metadata" playsinline></video>
      <button class="media-chip media-chip-button" type="button" data-card-action="view" data-card-index="${index}">View video</button>
    </div>`;
  }
  if (mediaUrl && isImageMedia(mediaCard)) {
    return `<button class="card-media card-media-button" type="button" data-card-action="view" data-card-index="${index}" aria-label="View ${safeTitle}">
      <img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(mediaCard.mediaAlt || card.title || 'Record media')}" loading="lazy">
      <span class="media-chip">${safeTag}</span>
    </button>`;
  }
  return '';
}

function contentLibraryMediaItems(card = {}) {
  const items = Array.isArray(card.media) ? card.media.filter((item) => item && item.url) : [];
  if (items.length) return items;
  if (card.mediaUrl) return [{ title: card.mediaAlt || card.title || 'Media', url: card.mediaUrl, type: card.mediaType || '', alt: card.mediaAlt || card.title || 'Media' }];
  return [];
}

function mediaCardType(card = {}) {
  const first = contentLibraryMediaItems(card)[0] || {};
  const url = card.mediaUrl || first.url || '';
  const type = card.mediaType || first.type || card.type || '';
  const probe = { mediaUrl: url, mediaType: type, type };
  if (url && isVideoMedia(probe)) return 'video';
  if (url && isImageMedia(probe)) return 'image';
  if (String(type).toLowerCase().includes('audio')) return 'audio';
  if (url) return 'document';
  return String(type || 'post').toLowerCase();
}

function mediaLibraryCard(card, index, options = {}) {
  const mediaItems = contentLibraryMediaItems(card);
  const first = mediaItems[0] || {};
  const url = card.mediaUrl || first.url || '';
  const type = mediaCardType({ ...card, mediaUrl: url, mediaType: card.mediaType || first.type || card.type });
  const title = card.title || card.fileName || 'Untitled';
  const brand = detailsValue(card, ['Brand']) || card.brandName || card.brand || 'Workspace';
  const size = detailsValue(card, ['Size']) || detailsValue(card, ['Media count']) || (mediaItems.length ? `${mediaItems.length} asset${mediaItems.length === 1 ? '' : 's'}` : 'No media');
  const preview = type === 'image' && url
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(card.mediaAlt || title)}" loading="lazy">`
    : type === 'video' && url
      ? `<video src="${escapeHtml(url)}" controls preload="metadata" playsinline></video>`
      : `<div class="media-placeholder">${escapeHtml(type || 'post')}</div>`;
  const actionLabel = options.actionLabel || (card.kind === 'media' ? 'Create draft' : 'Open');
  const actionButton = card.kind === 'media' && card.id
    ? `<form action="/dashboard/actions/media/${escapeHtml(card.id)}/create-draft" method="post" class="inline-form">${csrfInput()}<button class="btn btn-ghost" type="submit">${escapeHtml(actionLabel)}</button></form>`
    : `<button class="btn btn-ghost" type="button" data-card-action="view" data-card-index="${index}">${escapeHtml(actionLabel)}</button>`;
  const editButton = canEditCard(card) ? `<button class="btn btn-ghost" type="button" data-card-action="edit" data-card-index="${index}">Edit</button>` : '';
  const archiveButton = card.archiveAction ? `<form action="${escapeHtml(card.archiveAction)}" method="post" class="inline-form" data-confirm="Archive this media item?">${csrfInput()}<button class="btn btn-ghost" type="submit">Archive</button></form>` : '';
  const deleteButton = card.deleteAction ? `<form action="${escapeHtml(card.deleteAction)}" method="post" class="inline-form" data-confirm="Delete this item?">${csrfInput()}<button class="btn btn-ghost" type="submit">Delete</button></form>` : '';
  const transformButtons = card.kind === 'media' && card.id && type === 'image'
    ? ['crop_square:Square', 'crop_vertical:9:16', 'crop_portrait:4:5', 'crop_landscape:16:9', 'compress:Compress'].map((item) => {
        const [actionType, label] = item.split(':');
        return `<form action="/dashboard/actions/media/${escapeHtml(card.id)}/creative" method="post" class="inline-form">${csrfInput()}<input type="hidden" name="actionType" value="${escapeHtml(actionType)}"><button class="btn btn-ghost" type="submit">${escapeHtml(label)}</button></form>`;
      }).join('')
    : '';
  return `<article class="media-card dashboard-media-card" data-record-kind="${escapeHtml(card.kind || 'record')}" data-card-index="${index}" data-media-type="${escapeHtml(type)}" data-media-folder="${escapeHtml(detailsValue(card, ['Folder']))}" data-media-tags="${escapeHtml(detailsValue(card, ['Tags']))}">
    ${preview}
    <div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(brand)} - ${escapeHtml(size)}</p>
      ${card.description ? `<p>${escapeHtml(card.description)}</p>` : ''}
      <div class="stack-actions dashboard-media-actions">
        ${actionButton}
        ${editButton}
        ${transformButtons}
        ${archiveButton}
        ${deleteButton}
      </div>
    </div>
  </article>`;
}

function mediaLibraryGrid(cards = [], emptyMessage = 'No media yet') {
  if (!cards.length) {
    return `<article class="empty-state"><h2>${escapeHtml(emptyMessage)}</h2><p>Upload or create media, then these cards will match the Media & Images layout.</p></article>`;
  }
  return `<section class="media-grid dashboard-media-library-grid">${cards.map((card, index) => mediaLibraryCard(card, index)).join('')}</section>`;
}

function renderMediaLibraryShell(page = {}, options = {}) {
  const cards = Array.isArray(page.cards) ? page.cards : [];
  const kicker = options.kicker || 'media library';
  const title = options.title || 'Media & Images';
  const description = options.description || 'Uploaded and generated assets use one reusable media-card design.';
  const emptyMessage = options.emptyMessage || 'No media assets yet';
  const action = options.action || '<a class="btn btn-ghost" href="/dashboard/media">Upload media</a>';
  const filters = options.filters ? `<div class="media-filter-bar">
    <input type="search" placeholder="Search media" data-media-search>
    <select data-media-filter>
      <option value="">All types</option>
      <option value="image">Images</option>
      <option value="video">Videos</option>
      <option value="audio">Audio</option>
      <option value="document">Documents</option>
    </select>
  </div>` : '';
  return `<article class="card dashboard-media-shell">
    <div class="card-head">
      <div><span class="kicker">${escapeHtml(kicker)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>
      ${action}
    </div>
    ${filters}
    ${mediaLibraryGrid(cards, emptyMessage)}
  </article>`;
}

function renderMediaDashboard(page = {}) {
  return renderMediaLibraryShell(page, {
    kicker: 'media library',
    title: 'Media & Images',
    description: 'Uploaded and generated assets use one reusable media-card design.',
    emptyMessage: 'No media assets yet',
    action: '<a class="btn btn-ghost" href="/dashboard/media">Upload media</a>',
    filters: true
  });
}

function renderContentLibraryDashboard(page = {}) {
  return renderMediaLibraryShell(page, {
    kicker: 'content library',
    title: 'Content Library',
    description: 'Saved posts use the same Media & Images card layout, spacing, thumbnails and actions.',
    emptyMessage: 'No saved posts yet',
    action: `<a class="btn btn-primary" href="/dashboard/quick-create">${icon('plus')}New post</a>`
  });
}

function renderApprovalsHandoffDashboard(page = {}) {
  const cards = Array.isArray(page.cards) ? page.cards : [];
  return `${templateHtml('approvals')}
    <article class="card handoff-queue-card">
      <div class="card-head">
        <div><span class="kicker">review queue</span><h3>Approvals and handoff queue</h3><p>Client approval requests, handoff posts and publish-after-approval items stay together in one restored workflow.</p></div>
        <a class="btn btn-primary" href="/dashboard/quick-create">${icon('plus')}Create review post</a>
      </div>
      ${cards.length ? renderCards(cards) : '<article class="empty-state"><h2>No approval requests yet</h2><p>Create a draft, choose Handoff or Approval mode in the full composer, and requests will appear here.</p></article>'}
    </article>
    ${renderRows(page.rows)}
    ${renderTable(page)}`;
}

function detailsValue(card = {}, keys = []) {
  const details = card.details || {};
  for (const key of keys) {
    if (details[key] !== undefined && details[key] !== null && details[key] !== '') return String(details[key]);
  }
  return '';
}

function usagePercentFromCard(card = {}) {
  const raw = detailsValue(card, ['Percent']);
  if (!raw || raw === 'Unlimited') return null;
  const num = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? Math.max(0, Math.min(100, num)) : null;
}

function renderBillingDashboard(page = {}) {
  const cards = Array.isArray(page.cards) ? page.cards : [];
  const subscriptions = cards.filter((card) => card.kind === 'subscription');
  const payments = cards.filter((card) => card.kind === 'payment');
  const usage = cards.filter((card) => card.kind === 'usage');
  const activeSubscription = subscriptions[0] || {};
  const planLabel = currentPlan.name || detailsValue(activeSubscription, ['Plan']) || activeSubscription.title || 'Current plan';
  const statusLabel = detailsValue(activeSubscription, ['Status']) || activeSubscription.status || 'Active';
  const providerLabel = detailsValue(activeSubscription, ['Provider']) || 'Pesapal';
  const renewLabel = detailsValue(activeSubscription, ['Current period end']) || 'Billing period not set';
  const usageRows = usage.length ? usage.slice(0, 10).map((card) => {
    const percent = usagePercentFromCard(card);
    const used = detailsValue(card, ['Used']) || '';
    const limit = detailsValue(card, ['Limit']) || '';
    return `<article class="billing-usage-row">
      <div><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(card.description || `${used} / ${limit}`)}</span></div>
      <div class="billing-progress-wrap">${percent === null ? '<span class="badge">Unlimited</span>' : `<progress max="100" value="${percent}"></progress><small>${percent}%</small>`}</div>
    </article>`;
  }).join('') : '<article class="empty-state"><h2>No usage records yet</h2><p>Usage will appear after you create posts, generate AI assets, connect accounts, or invite team members.</p></article>';
  const paymentRows = payments.length ? payments.slice(0, 8).map((card) => `<article class="billing-timeline-row">
      <div><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(card.description)}</span></div>
      <span class="plan-status-chip">${escapeHtml(card.status || card.tag || 'payment')}</span>
    </article>`).join('') : '<p class="muted">No payment history yet.</p>';
  const subscriptionRows = subscriptions.length ? subscriptions.map((card) => `<article class="billing-timeline-row">
      <div><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(card.description)}</span></div>
      <span class="plan-status-chip">${escapeHtml(card.status || card.tag || 'subscription')}</span>
    </article>`).join('') : '<p class="muted">No subscription record found. Choose a plan and complete Pesapal checkout.</p>';
  const canManagePlans = isAllowedPage('plans');
  const planCards = dashboardPublicPlans.length ? dashboardPublicPlans.map((plan) => {
    const isCurrent = currentPlan.slug === plan.slug;
    const priceLine = plan.isTrial ? escapeHtml(plan.priceLabel || 'Free') : `${escapeHtml(plan.priceLabel || '')}<span>/${escapeHtml(plan.intervalLabel || 'mo')}</span>`;
    const featureList = Array.isArray(plan.featureList) && plan.featureList.length
      ? plan.featureList.slice(0, 5).map((feature) => `<li>${icon('check')}${escapeHtml(feature)}</li>`).join('')
      : '<li>No public feature checklist yet.</li>';
    const action = isCurrent
      ? '<button class="btn btn-ghost" type="button" disabled>Current plan</button>'
      : plan.isTrial
        ? `<form action="/dashboard/billing/plan" method="post">${csrfInput()}<input type="hidden" name="plan" value="${escapeHtml(plan.slug)}"><button class="btn btn-primary" type="submit">Activate trial</button></form>`
        : `<form action="${escapeHtml(plan.checkoutUrl || `/dashboard/billing/checkout/${encodeURIComponent(plan.slug)}`)}" method="post">${csrfInput()}<button class="btn btn-primary" type="submit">Choose and pay</button></form>`;
    return `<article class="billing-plan-card ${plan.isPopular ? 'is-popular' : ''}">
      <div class="plan-card-topline"><span class="plan-status-chip">${plan.isPopular ? 'Popular' : 'Plan'}</span></div>
      <h3>${escapeHtml(plan.name || 'Plan')}</h3>
      <p>${escapeHtml(plan.description || '')}</p>
      <div class="billing-plan-price"><strong>${priceLine}</strong></div>
      <ul class="plan-feature-list compact-plan-feature-list">${featureList}</ul>
      ${action}
    </article>`;
  }).join('') : '<article class="empty-state"><h2>No plans available</h2><p>Ask an admin to publish active plans.</p></article>';
  return `${templateHtml('billing')}
    <section class="billing-clean-shell">
      <article class="billing-current-card">
        <div>
          <span class="kicker">current subscription</span>
          <h3>${escapeHtml(planLabel)}</h3>
          <p>${escapeHtml(statusLabel)} · ${escapeHtml(providerLabel)} · ${escapeHtml(renewLabel)}</p>
        </div>
        <div class="billing-action-stack">
          <a class="btn btn-primary" href="/pricing">Compare plans</a>
          ${canManagePlans ? '<a class="btn btn-ghost" href="/dashboard/plans">Plan management</a>' : ''}
        </div>
      </article>
      <article class="card billing-usage-card">
        <div class="card-head"><div><span class="kicker">usage</span><h3>Plan usage</h3><p>Watch the limits that affect upgrades, hard blocks and automation access.</p></div><span class="badge">${escapeHtml(usage.length)} tracked</span></div>
        <div class="billing-usage-list">${usageRows}</div>
      </article>
      <article class="card billing-plan-picker">
        <div class="card-head"><div><span class="kicker">choose plan</span><h3>Upgrade or switch subscription</h3><p>Selecting a paid plan creates a payment and redirects you to the payment activation page.</p></div><a class="btn btn-ghost" href="/pricing">Compare public pricing</a></div>
        <div class="billing-plan-grid">${planCards}</div>
      </article>
      <div class="billing-two-column">
        <article class="card"><div class="card-head"><div><span class="kicker">subscription</span><h3>Subscription status</h3></div></div><div class="billing-timeline">${subscriptionRows}</div></article>
        <article class="card"><div class="card-head"><div><span class="kicker">payments</span><h3>Payments and invoices</h3></div><a class="btn btn-ghost" href="/pricing">Upgrade</a></div><div class="billing-timeline">${paymentRows}</div></article>
      </div>
    </section>`;
}

function canEditCard(card = {}) {
  return Boolean(card.editAction || card.editHref || (Array.isArray(card.editFields) && card.editFields.length) || card.kind === 'brand' || card.kind === 'post');
}

function cardActionButtons(card, index, routes) {
  const editButton = canEditCard(card)
    ? `<button class="tool-btn" type="button" data-card-action="edit" data-card-index="${index}">Edit</button>`
    : '';
  const extraAction = card.actionHref
    ? `<a class="tool-btn" href="${escapeHtml(card.actionHref)}">${escapeHtml(card.actionLabel || 'Action')}</a>`
    : '';
  return `<button class="tool-btn" type="button" data-card-action="view" data-card-index="${index}">View</button>${editButton}${extraAction}`;
}

function renderCards(cards = []) {
  if (!cards.length) {
    return `<article class="empty-state"><h2>No real records yet</h2><p>When this section has database records, they will appear here.</p></article>`;
  }
  const routes = routeMap[currentPage] || routeMap.overview;
  return `<div class="card-grid">${cards.map((card, index) => {
    const normalizedKind = normalizedCardKind(card);
    const hideDescription = currentPage === 'content-library' || normalizedKind === 'post' || card.hideCardDescription;
    const descriptionHtml = !hideDescription && card.description
      ? `<p>${escapeHtml(card.description)}</p>`
      : '';
    return `
    <article class="clean-card" data-record-kind="${escapeHtml(card.kind || 'record')}" data-card-index="${index}">
      ${cardMedia(card, index)}
      <div class="card-content">
        <span class="card-icon">${cardIcon(card)}</span>
        <h4>${escapeHtml(card.title)}</h4>
        ${descriptionHtml}
      </div>
      <div class="card-tools">
        <span class="pill">${iconForTag(card.tag || card.status || card.kind)}${escapeHtml(card.tag || card.status || 'Record')}</span>
        ${cardActionButtons(card, index, routes)}
      </div>
    </article>`;
  }).join('')}</div>`;
}

function brandInitials(name = '') {
  return String(name || 'Brand')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'BR';
}

function listValue(value = []) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || 'Not saved';
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(', ') || 'Not saved';
  return value || 'Not saved';
}

function brandLogo(brand) {
  if (brand.logo) return `<img src="${escapeHtml(brand.logo)}" alt="${escapeHtml(brand.name)} logo">`;
  return `<span>${escapeHtml(brandInitials(brand.name))}</span>`;
}

function brandSummary(brand) {
  const productServiceCount = (brand.products?.length || 0) + (brand.services?.length || 0);
  return `${brand.businessType || 'Brand'} · ${brand.brandCompletenessScore || brand.checklist?.score || 0}% complete · ${productServiceCount} products/services · ${brand.offers?.length || 0} offers · ${brand.brandRules?.length || 0} rules`;
}

function brandChecklistHtml(brand) {
  const checklist = brand.checklist || {};
  const sections = Array.isArray(checklist.sections) ? checklist.sections : [];
  if (!sections.length) return '';
  const score = checklist.score || brand.brandCompletenessScore || 0;
  return `<section class="brand-checklist-panel full">
    <div class="brand-completion-head">
      <div><span class="kicker">completion</span><h4>${escapeHtml(score)}% Brand Brain ready</h4></div>
      <span class="badge">${escapeHtml(checklist.complete || 0)}/${escapeHtml(checklist.total || 0)}</span>
    </div>
    <div class="brand-completion-bar"><span style="width:${Math.max(0, Math.min(100, Number(score || 0)))}%"></span></div>
    <div class="brand-checklist-grid">${sections.map((section) => `
      <div class="brand-checklist-section">
        <strong>${escapeHtml(section.title)}</strong>
        <ul>${(section.items || []).map((item) => `<li class="${item.complete ? 'is-complete' : 'is-missing'}">${icon(item.complete ? 'check' : 'x')}${escapeHtml(item.label)}</li>`).join('')}</ul>
      </div>
    `).join('')}</div>
  </section>`;
}

function hiddenBrandInput(name, value = '') {
  return `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
}

function brandEditForm(brand) {
  return `<form action="/dashboard/actions/brands/${escapeHtml(brand.id)}?_method=PUT" method="post" class="real-form-grid modal-edit-form" data-brand-upload-form data-brand-id="${escapeHtml(brand.id)}">
    ${hiddenBrandInput('_csrf', liveData.csrfToken || document.querySelector('input[name="_csrf"]')?.value || '')}
    <label>Brand name<input name="name" required value="${escapeHtml(brand.name)}"></label>
    <label>Business type<input name="businessType" value="${escapeHtml(brand.businessType)}"></label>
    <label>Industry<input name="industry" value="${escapeHtml(brand.industry || '')}"></label>
    <input type="hidden" name="logo" value="${escapeHtml(brand.logo)}" data-brand-upload-url="logo">
    <input type="hidden" name="logoPublicId" value="${escapeHtml(brand.logoPublicId)}" data-brand-upload-public-id="logo">
    <input type="hidden" name="favicon" value="${escapeHtml(brand.favicon || '')}" data-brand-upload-url="favicon">
    <input type="hidden" name="faviconPublicId" value="${escapeHtml(brand.faviconPublicId || '')}" data-brand-upload-public-id="favicon">
    <input type="hidden" name="coverImage" value="${escapeHtml(brand.coverImage || '')}" data-brand-upload-url="cover">
    <input type="hidden" name="coverImagePublicId" value="${escapeHtml(brand.coverImagePublicId || '')}" data-brand-upload-public-id="cover">
    <input type="hidden" name="assetUploadsJson" value="[]" data-brand-upload-assets>
    <label class="brand-upload-control">Upload logo<input type="file" accept="image/*" data-brand-upload-file="logo"><small data-brand-upload-status="logo">Upload a new logo from your device.</small><img data-brand-upload-preview="logo" src="${escapeHtml(brand.logo || '')}" alt="Logo preview" ${brand.logo ? '' : 'hidden'}></label>
    <label class="brand-upload-control">Upload favicon<input type="file" accept="image/*" data-brand-upload-file="favicon"><small data-brand-upload-status="favicon">Upload a square icon.</small><img data-brand-upload-preview="favicon" src="${escapeHtml(brand.favicon || '')}" alt="Favicon preview" ${brand.favicon ? '' : 'hidden'}></label>
    <label class="brand-upload-control">Upload cover image<input type="file" accept="image/*" data-brand-upload-file="cover"><small data-brand-upload-status="cover">Upload a wide cover image.</small><img data-brand-upload-preview="cover" src="${escapeHtml(brand.coverImage || '')}" alt="Cover preview" ${brand.coverImage ? '' : 'hidden'}></label>
    <label class="brand-upload-control full">Upload extra brand assets<input type="file" multiple accept="image/*,video/*,.pdf" data-brand-upload-file="asset"><small data-brand-upload-status="asset">Upload product photos, PDFs, guidelines, and sample videos.</small></label>
    <label>Website<input name="website" value="${escapeHtml(brand.website)}"></label>
    <label>Location<input name="location" value="${escapeHtml(brand.location)}"></label>
    <label>Language<input name="language" value="${escapeHtml(brand.language)}"></label>
    <label>Tone<input name="tone" value="${escapeHtml(brand.tone)}"></label>
    <label>Posting frequency<input name="postingFrequency" value="${escapeHtml(brand.postingFrequency)}"></label>
    <label>Font style<input name="fontStyle" value="${escapeHtml(brand.fontStyle)}"></label>
    <label>Local style<input name="localStyle" value="${escapeHtml(brand.localStyle)}"></label>
    <label>Brand colors<input name="brandColors" value="${escapeHtml(brand.form?.brandColors || '')}"></label>
    <label class="full">Target audience<input name="targetAudience" value="${escapeHtml(brand.targetAudience)}"></label>
    <label class="full">Preferred CTA<input name="preferredCta" value="${escapeHtml(brand.preferredCta)}"></label>
    <label class="full">Description<textarea name="description" rows="4">${escapeHtml(brand.description)}</textarea></label>
    <label class="full">Products<textarea name="products" rows="3">${escapeHtml(brand.form?.products || '')}</textarea></label>
    <label class="full">Services<textarea name="services" rows="3">${escapeHtml(brand.form?.services || '')}</textarea></label>
    <label class="full">Offers<textarea name="offers" rows="3">${escapeHtml(brand.form?.offers || '')}</textarea></label>
    <label class="full">FAQs<textarea name="faqs" rows="3">${escapeHtml(brand.form?.faqs || '')}</textarea></label>
    <label class="full">Social links<textarea name="socialLinks" rows="3">${escapeHtml(brand.form?.socialLinks || '')}</textarea></label>
    <label>Goals<textarea name="goals" rows="3">${escapeHtml(brand.form?.goals || '')}</textarea></label>
    <label>Customer pain points<textarea name="customerPainPoints" rows="3">${escapeHtml(brand.form?.customerPainPoints || '')}</textarea></label>
    <label>Common objections<textarea name="commonObjections" rows="3">${escapeHtml(brand.form?.commonObjections || '')}</textarea></label>
    <label>Testimonials<textarea name="testimonials" rows="3">${escapeHtml(brand.form?.testimonials || '')}</textarea></label>
    <label>Brand rules<textarea name="brandRules" rows="3">${escapeHtml(brand.form?.brandRules || '')}</textarea></label>
    <label>Keywords<textarea name="keywords" rows="3">${escapeHtml(brand.form?.keywords || '')}</textarea></label>
    <label>Preferred words<textarea name="preferredWords" rows="3">${escapeHtml(brand.form?.preferredWords || '')}</textarea></label>
    <label>Preferred hashtags<textarea name="preferredHashtags" rows="3">${escapeHtml(brand.form?.preferredHashtags || '')}</textarea></label>
    <label>Blocked words<textarea name="blockedWords" rows="3">${escapeHtml(brand.form?.blockedWords || '')}</textarea></label>
    <label>Competitors<textarea name="competitors" rows="3">${escapeHtml(brand.form?.competitors || '')}</textarea></label>
    <label class="checkbox-line full"><input name="autoPostingEnabled" type="checkbox" ${brand.autoPosting?.enabled ? 'checked' : ''}> Auto-posting enabled</label>
    <label>Auto frequency unit<select name="autoFrequencyUnit"><option value="day" ${brand.autoPosting?.frequencyUnit === 'day' ? 'selected' : ''}>Day</option><option value="week" ${brand.autoPosting?.frequencyUnit === 'week' ? 'selected' : ''}>Week</option><option value="month" ${brand.autoPosting?.frequencyUnit === 'month' ? 'selected' : ''}>Month</option></select></label>
    <label>Posts per day<input name="autoPostsPerDay" type="number" min="1" value="${escapeHtml(brand.autoPosting?.postsPerDay || 1)}"></label>
    <label>Posts per week<input name="autoPostsPerWeek" type="number" min="1" value="${escapeHtml(brand.autoPosting?.postsPerWeek || 7)}"></label>
    <label>Posts per month<input name="autoPostsPerMonth" type="number" min="1" value="${escapeHtml(brand.autoPosting?.postsPerMonth || 30)}"></label>
    <label>Images min<input name="imagesPerPostMin" type="number" min="0" value="${escapeHtml(brand.autoPosting?.imagesPerPostMin || 1)}"></label>
    <label>Images max<input name="imagesPerPostMax" type="number" min="0" value="${escapeHtml(brand.autoPosting?.imagesPerPostMax || 3)}"></label>
    <label>Strength target<input name="strengthTarget" type="number" min="1" max="100" value="${escapeHtml(brand.autoPosting?.strengthTarget || 90)}"></label>
    <label class="full">Customer goal<input name="autoCustomerGoal" value="${escapeHtml(brand.autoPosting?.customerGoal || '')}"></label>
    <label class="full">Preferred slots<textarea name="autoPreferredSlots" rows="2">${escapeHtml(brand.form?.autoPreferredSlots || '')}</textarea></label>
    <label class="full">Media mix<textarea name="autoMediaMix" rows="2">${escapeHtml(brand.form?.autoMediaMix || '')}</textarea></label>
    <label class="full">Platform languages<textarea name="platformLanguages" rows="2">${escapeHtml(brand.form?.platformLanguages || '')}</textarea></label>
    <label class="checkbox-line full"><input name="autoRequireMedia" type="checkbox" ${brand.autoPosting?.requireMedia ? 'checked' : ''}> Require media for auto posts</label>
    <div class="real-form-actions full">
      <button class="btn btn-ghost" type="button" data-close-modal>Cancel</button>
      <button class="btn btn-primary" type="submit">Save changes</button>
    </div>
  </form>`;
}

function brandCreateForm() {
  const template = document.getElementById('dashboard-form-brand-brain');
  const clone = template ? template.content.cloneNode(true) : null;
  const wrapper = document.createElement('div');
  if (clone) wrapper.appendChild(clone);
  const formCard = wrapper.querySelector('.real-form-card');
  const form = wrapper.querySelector('form');
  if (formCard) {
    formCard.removeAttribute('id');
    formCard.classList.add('modal-create-card');
  }
  return formCard ? formCard.outerHTML : (form ? form.outerHTML : '<p class="empty-state">Create form unavailable.</p>');
}

function detailRow(label, value) {
  return `<label class="brand-read-field"><span>${escapeHtml(label)}</span><div>${value}</div></label>`;
}

function detailGroup(title, rows) {
  return `<section class="brand-detail-section full"><h4>${escapeHtml(title)}</h4><div class="brand-read-grid">${rows.join('')}</div></section>`;
}

function brandDetailHtml(brand) {
  const created = brand.createdAt ? new Date(brand.createdAt).toLocaleString() : 'Not saved';
  const updated = brand.updatedAt ? new Date(brand.updatedAt).toLocaleString() : 'Not saved';
  return `<div class="brand-view-header">
      <div class="brand-logo-lg">${brandLogo(brand)}</div>
      <div class="brand-view-title"><span class="modal-kicker">${escapeHtml(brand.status)}</span><h3>${escapeHtml(brand.name)}</h3><p>${escapeHtml(brandSummary(brand))}</p></div>
    </div>
    <div class="brand-view-form">
      ${detailGroup('Profile', [
        detailRow('Description', escapeHtml(brand.description || 'Not saved')),
        detailRow('Audience', escapeHtml(brand.targetAudience || 'Not saved')),
        detailRow('Tone', escapeHtml(brand.tone || 'Not saved')),
        detailRow('CTA', escapeHtml(brand.preferredCta || 'Not saved')),
        detailRow('Website', brand.website ? `<a href="${escapeHtml(brand.website)}" target="_blank" rel="noreferrer">${escapeHtml(brand.website)}</a>` : 'Not saved'),
        detailRow('Location / language', escapeHtml(`${brand.location || 'No location'} · ${brand.language || 'No language'}`))
      ])}
      ${detailGroup('Offer Memory', [
        detailRow('Products', escapeHtml((brand.products || []).map((item) => [item.name, item.price, item.description].filter(Boolean).join(' - ')).join(' | ') || 'Not saved')),
        detailRow('Offers', escapeHtml((brand.offers || []).map((item) => [item.title, item.description].filter(Boolean).join(' - ')).join(' | ') || 'Not saved')),
        detailRow('Pain points', escapeHtml(listValue(brand.customerPainPoints))),
        detailRow('Objections', escapeHtml(listValue(brand.commonObjections))),
        detailRow('Testimonials', escapeHtml((brand.testimonials || []).map((item) => [item.author, item.quote].filter(Boolean).join(': ')).join(' | ') || 'Not saved'))
      ])}
      ${detailGroup('Rules & Visuals', [
        detailRow('Rules', escapeHtml(listValue(brand.brandRules))),
        detailRow('Goals', escapeHtml(listValue(brand.goals))),
        detailRow('Hashtags', escapeHtml(listValue(brand.preferredHashtags))),
        detailRow('Blocked words', escapeHtml(listValue(brand.blockedWords))),
        detailRow('Competitors', escapeHtml(listValue(brand.competitors))),
        detailRow('Colors / font / local style', escapeHtml(`${listValue(brand.brandColors)} · ${brand.fontStyle || 'No font'} · ${brand.localStyle || 'No local style'}`))
      ])}
      ${detailGroup('Automation', [
        detailRow('Auto posting', escapeHtml(`${brand.autoPosting?.enabled ? 'Enabled' : 'Off'} · ${brand.autoPosting?.postsPerWeek || 0}/week`)),
        detailRow('Media mix', escapeHtml(listValue(brand.autoPosting?.mediaMix))),
        detailRow('Preferred slots', escapeHtml(listValue(brand.autoPosting?.preferredSlots))),
        detailRow('Platform languages', escapeHtml(listValue(brand.autoPosting?.platformLanguages))),
        detailRow('Created / updated', escapeHtml(`${created} · ${updated}`))
      ])}
    </div>
`;
}

function brandDetailHtmlV2(brand) {
  const created = brand.createdAt ? new Date(brand.createdAt).toLocaleString() : 'Not saved';
  const updated = brand.updatedAt ? new Date(brand.updatedAt).toLocaleString() : 'Not saved';
  const products = (brand.products || []).map((item) => [item.name, item.price, item.description].filter(Boolean).join(' - ')).join(' | ') || 'Not saved';
  const offers = (brand.offers || []).map((item) => [item.title, item.description].filter(Boolean).join(' - ')).join(' | ') || 'Not saved';
  const socialLinks = (brand.socialLinks || []).map((item) => [item.platform, item.url].filter(Boolean).join(': ')).join(' | ') || 'Not saved';
  const testimonials = (brand.testimonials || []).map((item) => [item.author, item.quote].filter(Boolean).join(': ')).join(' | ') || 'Not saved';
  const services = (brand.services || []).map((item) => [item.name, item.price, item.description].filter(Boolean).join(' - ')).join(' | ') || 'Not saved';
  const faqs = (brand.faqs || []).map((item) => [item.question, item.answer].filter(Boolean).join(': ')).join(' | ') || 'Not saved';
  return `<div class="brand-view-header">
      <div class="brand-logo-lg">${brandLogo(brand)}</div>
      <div class="brand-view-title"><span class="modal-kicker">${escapeHtml(brand.status)}</span><h3>${escapeHtml(brand.name)}</h3><p>${escapeHtml(brandSummary(brand))}</p></div>
    </div>
    <div class="brand-view-form">
      ${brandChecklistHtml(brand)}
      ${detailGroup('Profile', [
        detailRow('Brand name', escapeHtml(brand.name || 'Not saved')),
        detailRow('Business type', escapeHtml(brand.businessType || 'Not saved')),
        detailRow('Industry', escapeHtml(brand.industry || 'Not saved')),
        detailRow('Logo asset', brand.logo ? 'Uploaded and saved' : 'Not saved'),
        detailRow('Favicon asset', brand.favicon ? 'Uploaded and saved' : 'Not saved'),
        detailRow('Cover image asset', brand.coverImage ? 'Uploaded and saved' : 'Not saved'),
        detailRow('Website', brand.website ? `<a href="${escapeHtml(brand.website)}" target="_blank" rel="noreferrer">${escapeHtml(brand.website)}</a>` : 'Not saved'),
        detailRow('Location', escapeHtml(brand.location || 'Not saved')),
        detailRow('Language', escapeHtml(brand.language || 'Not saved')),
        detailRow('Posting frequency', escapeHtml(brand.postingFrequency || 'Not saved')),
        detailRow('Description', escapeHtml(brand.description || 'Not saved')),
        detailRow('Audience', escapeHtml(brand.targetAudience || 'Not saved')),
        detailRow('Tone', escapeHtml(brand.tone || 'Not saved')),
        detailRow('Preferred CTA', escapeHtml(brand.preferredCta || 'Not saved'))
      ])}
      ${detailGroup('Offer Memory', [
        detailRow('Products', escapeHtml(products)),
        detailRow('Services', escapeHtml(services)),
        detailRow('Offers', escapeHtml(offers)),
        detailRow('FAQs', escapeHtml(faqs)),
        detailRow('Social links', escapeHtml(socialLinks)),
        detailRow('Pain points', escapeHtml(listValue(brand.customerPainPoints))),
        detailRow('Objections', escapeHtml(listValue(brand.commonObjections))),
        detailRow('Testimonials', escapeHtml(testimonials))
      ])}
      ${detailGroup('Rules & Visuals', [
        detailRow('Rules', escapeHtml(listValue(brand.brandRules))),
        detailRow('Goals', escapeHtml(listValue(brand.goals))),
        detailRow('Keywords', escapeHtml(listValue(brand.keywords))),
        detailRow('Preferred words', escapeHtml(listValue(brand.preferredWords))),
        detailRow('Hashtags', escapeHtml(listValue(brand.preferredHashtags))),
        detailRow('Blocked words', escapeHtml(listValue(brand.blockedWords))),
        detailRow('Competitors', escapeHtml(listValue(brand.competitors))),
        detailRow('Brand colors', escapeHtml(listValue(brand.brandColors))),
        detailRow('Font style', escapeHtml(brand.fontStyle || 'Not saved')),
        detailRow('Local style', escapeHtml(brand.localStyle || 'Not saved'))
      ])}
      ${detailGroup('Automation', [
        detailRow('Auto posting', escapeHtml(brand.autoPosting?.enabled ? 'Enabled' : 'Off')),
        detailRow('Frequency unit', escapeHtml(brand.autoPosting?.frequencyUnit || 'Not saved')),
        detailRow('Posts per day', escapeHtml(brand.autoPosting?.postsPerDay || 0)),
        detailRow('Posts per week', escapeHtml(brand.autoPosting?.postsPerWeek || 0)),
        detailRow('Posts per month', escapeHtml(brand.autoPosting?.postsPerMonth || 0)),
        detailRow('Images per post', escapeHtml(`${brand.autoPosting?.imagesPerPostMin || 0} - ${brand.autoPosting?.imagesPerPostMax || 0}`)),
        detailRow('Customer goal', escapeHtml(brand.autoPosting?.customerGoal || 'Not saved')),
        detailRow('Require media', escapeHtml(brand.autoPosting?.requireMedia ? 'Yes' : 'No')),
        detailRow('Strength target', escapeHtml(brand.autoPosting?.strengthTarget || 0)),
        detailRow('Media mix', escapeHtml(listValue(brand.autoPosting?.mediaMix))),
        detailRow('Preferred slots', escapeHtml(listValue(brand.autoPosting?.preferredSlots))),
        detailRow('Platform languages', escapeHtml(listValue(brand.autoPosting?.platformLanguages))),
        detailRow('Created / updated', escapeHtml(`${created} - ${updated}`))
      ])}
    </div>
`;
}

function renderBrandBrain(page) {
  const records = brandRecords;
  if (!records.length) {
    return `<article class="card"><div class="empty-state"><h2>No Brand Brain yet</h2><p>Add your first brand so AI can use real audience, offer, tone, and visual rules.</p></div></article>${templateHtml('brand-brain')}`;
  }
  const focusBrand = records.find((brand) => Number(brand.checklist?.score || brand.brandCompletenessScore || 0) < 100) || records[0];
  const onboarding = `<article class="card brand-brain-card-shell">
    <div class="card-head"><div><h3>Brand onboarding checklist</h3><p>${escapeHtml(focusBrand.name)} is the current Brand Brain focus. Complete missing fields to improve every generator.</p></div><button class="btn btn-primary" type="button" data-brand-edit="${escapeHtml(focusBrand.id)}">Edit focus brand</button></div>
    ${brandChecklistHtml(focusBrand)}
  </article>`;
  const cards = `<article class="card brand-brain-card-shell"><div class="card-head"><div><h3>Brand Brain cards</h3><p>Real brand records with logo, status, edit, and complete detail modals.</p></div><span class="badge">${records.length} brands</span></div>
    <div class="brand-brain-grid">${records.map((brand) => `
      <article class="brand-brain-card">
        <div class="brand-brain-logo">${brandLogo(brand)}</div>
        <div class="brand-brain-body">
          <span class="kicker">${escapeHtml(brand.businessType || 'Brand')}</span>
          <h4>${escapeHtml(brand.name)}</h4>
          <p class="brand-card-description">${escapeHtml(brand.description || brand.targetAudience || 'No description saved yet.')}</p>
          <div class="brand-completion-bar" aria-label="${escapeHtml(brand.name)} completion"><span style="width:${Math.max(0, Math.min(100, Number(brand.checklist?.score || brand.brandCompletenessScore || 0)))}%"></span></div>
          <div class="brand-brain-metrics">
            <span>${brand.checklist?.score || brand.brandCompletenessScore || 0}% complete</span>
            <span>${(brand.products?.length || 0) + (brand.services?.length || 0)} products/services</span>
            <span>${brand.offers?.length || 0} offers</span>
            <span>${brand.brandRules?.length || 0} rules</span>
          </div>
        </div>
        <div class="brand-brain-actions">
          <button class="tool-btn" type="button" data-brand-view="${escapeHtml(brand.id)}">View</button>
          <button class="tool-btn" type="button" data-brand-edit="${escapeHtml(brand.id)}">Edit</button>
        </div>
      </article>
    `).join('')}</div></article>`;
  const table = `<article class="card"><div class="card-head"><div><h3>Brand Brain table</h3><p>Every row opens a full real-data modal.</p></div><button class="btn btn-primary" type="button" data-action="brand-create">${icon('plus')}Add brand</button></div>
    <div class="table-wrap"><table><thead><tr><th>Brand</th><th>Audience</th><th>Memory</th><th>Completion</th><th>Status</th><th>Actions</th></tr></thead><tbody>${records.map((brand) => `
      <tr>
        <td><strong>${escapeHtml(brand.name)}</strong><br><small>${escapeHtml(brand.businessType || 'Brand')}</small></td>
        <td>${escapeHtml(brand.targetAudience || 'Not saved')}</td>
        <td>${escapeHtml(`${(brand.products?.length || 0) + (brand.services?.length || 0)} products/services, ${brand.offers?.length || 0} offers, ${brand.brandRules?.length || 0} rules`)}</td>
        <td>${escapeHtml(brand.checklist?.score || brand.brandCompletenessScore || 0)}%</td>
        <td><span class="badge">${escapeHtml(brand.status)}</span></td>
        <td><button class="tool-btn" type="button" data-brand-view="${escapeHtml(brand.id)}">View</button> <button class="tool-btn" type="button" data-brand-edit="${escapeHtml(brand.id)}">Edit</button></td>
      </tr>
    `).join('')}</tbody></table></div></article>`;
  return `${onboarding}${cards}${table}`;
}

function socialConnectUrl(platform) {
  const brandId = dashboardBrands[0]?.id || '';
  if (!brandId) return '/dashboard/brand-brain';
  if (['facebook', 'instagram'].includes(platform.key)) return `/dashboard/actions/social/facebook/connect?brand=${encodeURIComponent(brandId)}`;
  if (platform.key === 'linkedin') return `/dashboard/actions/social/linkedin/connect?brand=${encodeURIComponent(brandId)}`;
  if (platform.key === 'tiktok') return `/dashboard/actions/social/tiktok/connect?brand=${encodeURIComponent(brandId)}`;
  if (platform.key === 'youtube') return `/dashboard/actions/social/youtube/connect?brand=${encodeURIComponent(brandId)}`;
  if (platform.key === 'google_business') return `/dashboard/actions/social/google-business/connect?brand=${encodeURIComponent(brandId)}`;
  if (platform.key === 'pinterest') return `/dashboard/actions/social/pinterest/connect?brand=${encodeURIComponent(brandId)}`;
  if (platform.key === 'x') return `/dashboard/actions/social/x/connect?brand=${encodeURIComponent(brandId)}`;
  if (platform.key === 'threads') return `/dashboard/actions/social/threads/connect?brand=${encodeURIComponent(brandId)}`;
  return '/dashboard/social';
}

function socialAccountRecord(account = {}) {
  const platformLabel = String(account.platform || 'platform').replace(/_/g, ' ');
  return normalizeRecordCard({
    id: account.id || '',
    kind: 'social-account',
    title: account.accountName || platformLabel,
    description: `${account.brandName || 'Workspace'} · ${platformLabel}`,
    tag: account.status || 'connected',
    status: account.status || 'connected',
    href: '/dashboard/social',
    editHref: account.id ? `/dashboard/actions/social/${account.id}` : '',
    editAction: account.id ? `/dashboard/actions/social/${account.id}/update` : '',
    editMethod: 'post',
    actions: account.id ? [
      { label: 'Reconnect', action: `/dashboard/actions/social/${account.id}/reconnect`, method: 'post', kind: 'reconnect' },
      { label: 'Disconnect', action: `/dashboard/actions/social/${account.id}/disconnect`, method: 'post', kind: 'disconnect', destructive: true }
    ] : [],
    deleteAction: account.id ? `/dashboard/actions/social/${account.id}/disconnect` : '',
    deleteLabel: 'Disconnect',
    deleteMethod: 'post',
    editFields: [
      { name: 'accountName', label: 'Account name', type: 'text', value: account.accountName || '', required: true },
      { name: 'accountId', label: 'Account ID', type: 'text', value: account.accountId || '' },
      { name: 'status', label: 'Status', type: 'select', value: account.status || 'connected', options: ['connected', 'mock', 'needs_reconnect', 'expired', 'failed', 'disconnected'] },
      { name: 'permissions', label: 'Permissions', type: 'text', value: (account.permissions || []).join(', ') },
      { name: 'accessToken', label: 'New access token', type: 'password', value: '', placeholder: 'Leave blank to keep current token' },
      { name: 'refreshToken', label: 'New refresh token', type: 'password', value: '', placeholder: 'Optional' }
    ],
    details: {
      Brand: account.brandName || 'Workspace',
      Platform: platformLabel,
      'Account name': account.accountName || '',
      'Account ID': account.accountId || '',
      Status: account.status || '',
      Permissions: account.permissions || [],
      'Last sync': account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString() : '',
      'Token expires': account.tokenExpiresAt ? new Date(account.tokenExpiresAt).toLocaleString() : ''
    }
  });
}

function openSocialAccountModal(accountId) {
  const account = dashboardSocialAccounts.find((item) => String(item.id) === String(accountId));
  if (!account) return;
  const record = socialAccountRecord(account);
  modalBackdrop.classList.add('show');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  modalKicker.textContent = 'Connected channel';
  modalTitle.textContent = record.title;
  modalBody.innerHTML = cardDetailHtml(record);
  modalActions.innerHTML = `<button class="btn btn-ghost" type="button" data-close-modal>Close</button><button class="btn btn-primary" type="button" data-social-edit="${escapeHtml(account.id)}">Edit</button>${(Array.isArray(record.actions) ? record.actions.map((action) => actionFromRecord(record, action)).join('') : '')}`;
  bindActions();
}

function openSocialEditModal(accountId) {
  const account = dashboardSocialAccounts.find((item) => String(item.id) === String(accountId));
  if (!account) return;
  const record = socialAccountRecord(account);
  modalBackdrop.classList.add('show');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  modalKicker.textContent = 'Edit connected channel';
  modalTitle.textContent = record.title;
  modalBody.innerHTML = genericEditHtml(record);
  modalActions.innerHTML = '';
  bindActions();
}

function apiConnectForm(platform) {
  const brandOptions = dashboardBrands.length
    ? dashboardBrands.map((brand) => `<option value="${escapeHtml(brand.id)}">${escapeHtml(brand.name)}</option>`).join('')
    : '<option value="">Create a Brand Brain first</option>';
  return `<form action="/dashboard/actions/social/api-connect" method="post" class="real-form-grid modal-edit-form record-edit-form">
    ${csrfInput()}
    <input type="hidden" name="platform" value="${escapeHtml(platform.key)}">
    <label>Brand<select name="brand" required>${brandOptions}</select></label>
    <label>Account name<input name="accountName" required placeholder="${escapeHtml(platform.shortName || platform.name)} account"></label>
    <label>Account ID<input name="accountId" required placeholder="Provider account ID"></label>
    <label>Permissions<input name="permissions" value="publish, analytics_read"></label>
    <label class="full">Access token<input name="accessToken" type="password" required autocomplete="off" placeholder="Paste API access token"></label>
    <label class="full">Refresh token<input name="refreshToken" type="password" autocomplete="off" placeholder="Optional"></label>
    <div class="real-form-actions full"><button class="btn btn-ghost" type="button" data-close-modal>Cancel</button><button class="btn btn-primary" type="submit">Save connection</button></div>
  </form>`;
}

function openSocialConnectModal(platformKey) {
  const platform = socialPlatforms.find((item) => item.key === platformKey);
  if (!platform) return;
  modalBackdrop.classList.add('show');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  modalKicker.textContent = 'Connect channel';
  modalTitle.textContent = platform.name;
  modalBody.innerHTML = apiConnectForm(platform);
  modalActions.innerHTML = '';
  bindActions();
}

function openSocialPlatformModal(platformKey) {
  const platform = socialPlatforms.find((item) => item.key === platformKey);
  if (!platform) return;
  const accounts = dashboardSocialAccounts.filter((account) => account.platform === platform.key);
  const connectUrl = socialConnectUrl(platform);
  const isOAuth = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'google_business', 'pinterest', 'x', 'threads'].includes(platform.key);
  const record = normalizeRecordCard({
    kind: 'social-platform',
    title: platform.name,
    description: platform.description,
    tag: accounts.length ? `${accounts.length} connected` : 'not connected',
    href: '/dashboard/social',
    actionHref: isOAuth ? connectUrl : '',
    actionLabel: accounts.length ? 'Add another' : platform.primaryAction,
    details: {
      Platform: platform.name,
      Type: platform.kind === 'oauth' ? 'OAuth' : 'API',
      Status: accounts.length ? `${accounts.length} connected` : 'Not connected',
      Description: platform.description,
      'Connected accounts': accounts.map((account) => `${account.accountName || account.platform} · ${account.status}`)
    }
  });
  modalBackdrop.classList.add('show');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  modalKicker.textContent = 'Channel';
  modalTitle.textContent = platform.name;
  modalBody.innerHTML = cardDetailHtml(record);
  modalActions.innerHTML = isOAuth
    ? `<button class="btn btn-ghost" type="button" data-close-modal>Close</button><a class="btn btn-primary" href="${escapeHtml(connectUrl)}">${escapeHtml(accounts.length ? 'Add another' : platform.primaryAction)}</a>`
    : `<button class="btn btn-ghost" type="button" data-close-modal>Close</button><button class="btn btn-primary" type="button" data-social-connect="${escapeHtml(platform.key)}">${escapeHtml(accounts.length ? 'Add another' : platform.primaryAction)}</button>`;
  bindActions();
}

function renderSocialDashboard() {
  const connected = dashboardSocialAccounts.filter((account) => account.status === 'connected');
  const platformCards = socialPlatforms.map((platform) => {
    const connectUrl = socialConnectUrl(platform);
    const platformAccounts = connected.filter((account) => account.platform === platform.key);
    const primaryLabel = platformAccounts.length ? 'Add another' : platform.primaryAction;
    const isOAuth = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'google_business', 'pinterest', 'x', 'threads'].includes(platform.key);
    const connectControl = isOAuth
      ? `<a class="btn btn-primary" href="${connectUrl}">${icon('plus')}${escapeHtml(primaryLabel)}</a>`
      : `<button class="btn btn-primary" type="button" data-social-connect="${escapeHtml(platform.key)}">${icon('plus')}${escapeHtml(primaryLabel)}</button>`;
    return `<article class="dashboard-channel-card ${platformAccounts.length ? 'is-connected' : 'is-disconnected'}">
      <div class="dashboard-channel-top">
        ${platformIcon(platform.key)}
        <span class="dashboard-channel-dot" aria-hidden="true"></span>
      </div>
      <div class="dashboard-channel-body">
        <h3>${escapeHtml(platform.name)}</h3>
        <p>${escapeHtml(platform.description)}</p>
        <div class="dashboard-channel-meta">
          <span class="badge">${platformAccounts.length ? `${platformAccounts.length} connected` : 'not connected'}</span>
          <span>${platform.kind === 'oauth' ? 'OAuth' : 'API'}</span>
        </div>
      </div>
      <div class="dashboard-channel-actions">
        <button class="btn btn-ghost" type="button" data-social-platform="${escapeHtml(platform.key)}">View</button>
        ${connectControl}
      </div>
    </article>`;
  }).join('');
  const connectedCards = connected.length
    ? connected.map((account) => `<article class="dashboard-connected-card">
        <div class="dashboard-connected-main">
          ${platformIcon(account.platform)}
          <div>
            <span class="kicker">${escapeHtml(account.brandName || 'Workspace')}</span>
            <h3>${escapeHtml(account.accountName || account.platform)}</h3>
            <p>${escapeHtml(account.platform.replace('_', ' '))}</p>
          </div>
        </div>
        <div class="dashboard-connected-actions">
          <button class="btn btn-ghost" type="button" data-social-view="${escapeHtml(account.id)}">View</button>
          <button class="btn btn-status" type="button" data-social-view="${escapeHtml(account.id)}">${escapeHtml(account.status || 'connected')}</button>
          <form action="/dashboard/actions/social/${escapeHtml(account.id)}/disconnect" method="post" data-confirm="Disconnect this channel?">${csrfInput()}<button class="btn btn-ghost btn-danger-subtle" type="submit">Disconnect</button></form>
        </div>
      </article>`).join('')
    : `<article class="empty-state"><h2>No connected channels yet</h2><p>Connect a platform above. Connected accounts will appear here with preview and token status actions.</p></article>`;
  return `<section class="dashboard-channel-grid" aria-label="Available channels">${platformCards}</section>
    <article class="card dashboard-connected-panel"><div class="card-head"><div><span class="kicker">connected</span><h3>Channel previews</h3><p>Only the essentials are shown here. Use View for IDs, permissions, token status, Edit and reconnect. Disconnect stays available on the card.</p></div><span class="badge">${connected.length} connected</span></div><div class="dashboard-connected-grid">${connectedCards}</div></article>`;
}


function csrfInput() {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(liveData.csrfToken || '')}">`;
}

function dateTimeLocalValue(isoValue) {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: dashboardTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).reduce((map, part) => {
      if (part.type !== 'literal') map[part.type] = part.value;
      return map;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour || '00'}:${parts.minute || '00'}`;
  } catch (error) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
}

function scheduleDefaultLocalValue() {
  const nextHour = new Date(Date.now() + 60 * 60 * 1000);
  nextHour.setMinutes(0, 0, 0);
  return dateTimeLocalValue(nextHour.toISOString());
}

function statusDot(status = 'scheduled') {
  return `<span class="dashboard-status-dot dashboard-status-${escapeHtml(status)}" aria-hidden="true"></span>`;
}

function calendarPostActions(post) {
  const postId = escapeHtml(post.id);
  return `<div class="dashboard-library-actions compact-post-actions">
    <button class="btn btn-ghost" type="button" data-calendar-post-view="${postId}">View</button>
    <button class="btn btn-ghost" type="button" data-calendar-post-edit="${postId}">Edit</button>
    ${post.canRetry ? `<form action="/dashboard/actions/posts/${postId}/retry" method="post" class="inline-form">${csrfInput()}<button class="btn btn-ghost" type="submit">Retry</button></form>` : ''}
    <button class="btn btn-primary" type="button" data-calendar-post-view="${postId}">More</button>
  </div>`;
}

function calendarPostMedia(post = {}) {
  const firstMedia = Array.isArray(post.media) ? post.media.find((item) => item?.url) : null;
  const mediaUrl = post.mediaUrl || firstMedia?.url || '';
  const mediaType = post.mediaType || firstMedia?.type || post.type || '';
  if (!mediaUrl) return '';
  const mediaCard = { title: post.title || 'Scheduled post', mediaUrl, mediaType, mediaAlt: firstMedia?.name || post.title || 'Post media' };
  if (isVideoMedia(mediaCard)) {
    return `<div class="dashboard-library-media dashboard-library-video"><video src="${escapeHtml(mediaUrl)}" controls preload="metadata" playsinline></video></div>`;
  }
  if (isImageMedia(mediaCard)) {
    return `<button class="dashboard-library-media dashboard-library-media-button" type="button" data-calendar-media="${escapeHtml(mediaUrl)}" aria-label="Open ${escapeHtml(post.title || 'post')} media"><img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(mediaCard.mediaAlt)}" loading="lazy"></button>`;
  }
  return `<div class="dashboard-library-media dashboard-library-file"><a class="btn btn-ghost" href="${escapeHtml(mediaUrl)}" target="_blank" rel="noopener">Open media</a></div>`;
}

function calendarLibraryPost(post, compact = false) {
  return `<article class="dashboard-library-post ${compact ? 'is-compact' : ''}" ${post?.id ? `draggable="true" data-calendar-drag-post="${escapeHtml(post.id)}"` : ''}>
    <div class="dashboard-library-main">
      ${calendarPostMedia(post)}
      <div class="dashboard-library-title-row">
        <span class="pill">${statusDot(post.status)}${escapeHtml(post.status)}</span>
        <span class="pill">${platformIcon(post.platform)}${escapeHtml(String(post.platform || '').replace(/_/g, ' '))}</span>
        ${!compact && post.canBulkReschedule ? `<label class="calendar-bulk-check"><input form="calendarBulkRescheduleForm" name="postIds" type="checkbox" value="${escapeHtml(post.id)}">Bulk</label>` : ''}
      </div>
      <h3>${escapeHtml(post.title || 'Scheduled post')}</h3>
      <div class="dashboard-library-meta">
        <span>${escapeHtml(post.brandName || 'Missing brand')}</span>
        <span>${escapeHtml(post.dateTimeLabel || post.dateLabel || 'No date')}</span>
        <span>${escapeHtml(post.type || 'text')}</span>
      </div>
    </div>
    ${compact ? '' : calendarPostActions(post)}
  </article>`;
}

function calendarVisibleDays(days, view, focusDay) {
  if (view === 'list') return days;
  const index = Math.max(0, days.findIndex((day) => day.key === focusDay));
  if (view === 'week') {
    const start = Math.floor((index >= 0 ? index : 0) / 7) * 7;
    return days.slice(start, start + 7);
  }
  if (view === 'day') {
    const day = days.find((item) => item.key === focusDay);
    return day ? [day] : [];
  }
  return days;
}

function postsFromCalendarDays(days) {
  const seen = new Set();
  return days.flatMap((day) => day.posts || []).filter((post) => {
    if (!post?.id || seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
}

function calendarViewHref(view, monthValue, focusDay) {
  const params = new URLSearchParams();
  params.set('view', view);
  if (monthValue) params.set('month', monthValue);
  if (view !== 'month' && focusDay) params.set('day', focusDay);
  return `/dashboard/calendar?${params.toString()}`;
}

function renderCalendarDashboard(page) {
  const days = Array.isArray(dashboardCalendar.days) ? dashboardCalendar.days : [];
  const posts = Array.isArray(dashboardCalendar.posts) ? dashboardCalendar.posts : [];
  const weekdays = dashboardCalendar.weekdays || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayKey = dashboardCalendar.todayKey || dashboardTodayKey();
  const monthLabelText = dashboardCalendar.monthLabel || 'Content calendar';
  const previousMonth = dashboardCalendar.previousMonth || '';
  const nextMonth = dashboardCalendar.nextMonth || '';
  const params = new URLSearchParams(location.search || '');
  const viewMode = params.get('view') || dashboardCalendar.view || 'month';
  const focusDay = params.get('day') || dashboardCalendar.focusDay || todayKey;
  const visibleDays = calendarVisibleDays(days, viewMode, focusDay);
  const visiblePosts = viewMode === 'month' || viewMode === 'list' ? posts : postsFromCalendarDays(visibleDays);
  const bestTimeSuggestions = Array.isArray(dashboardCalendar.bestTimeSuggestions) ? dashboardCalendar.bestTimeSuggestions : [];
  const viewTabs = ['month', 'week', 'day', 'list'].map((view) => `<a class="btn ${viewMode === view ? 'btn-primary' : 'btn-ghost'}" href="${escapeHtml(calendarViewHref(view, dashboardCalendar.monthValue, focusDay))}">${escapeHtml(view)}</a>`).join('');
  const suggestionBar = bestTimeSuggestions.length
    ? `<div class="calendar-best-times">${bestTimeSuggestions.map((item) => `<button class="btn btn-ghost" type="button" data-calendar-best-time="${escapeHtml(item.scheduledAt)}"><strong>${escapeHtml(item.time)}</strong><span>${escapeHtml(item.brandName)} / ${escapeHtml(item.platform)}</span></button>`).join('')}</div>`
    : '';
  const bulkForm = visiblePosts.length
    ? `<form id="calendarBulkRescheduleForm" class="calendar-bulk-form" action="/dashboard/actions/posts/bulk-reschedule" method="post">${csrfInput()}<label class="calendar-bulk-field"><span>Start time</span><input class="calendar-bulk-input" id="calendarBulkScheduledAt" name="scheduledAt" type="datetime-local"></label><label class="calendar-bulk-field"><span>Spacing min</span><input class="calendar-bulk-input" name="spacingMinutes" type="number" min="0" max="1440" value="30"></label><label class="calendar-bulk-field"><span>Shift days</span><input class="calendar-bulk-input" name="dayOffset" type="number" value="0"></label><button class="btn btn-primary" type="submit">Bulk reschedule</button></form>`
    : '';
  const realPostList = visiblePosts.length
    ? visiblePosts.slice(0, 60).map((post) => calendarLibraryPost(post)).join('')
    : `<article class="empty-state"><h2>No scheduled content this month</h2><p>Use the schedule form or full composer to add real posts to the calendar.</p></article>`;
  const calendarGrid = days.length
    ? visibleDays.map((day) => {
        const visiblePosts = (day.posts || []).slice(0, 2);
        const hiddenCount = Math.max(0, (day.posts || []).length - visiblePosts.length);
        const postCount = (day.posts || []).length;
        const singlePost = postCount === 1 ? (day.posts || [])[0] : null;
        const dayOpenAttr = singlePost
          ? `data-calendar-post-view="${escapeHtml(singlePost.id)}"`
          : `data-library-day="${escapeHtml(day.key)}"`;
        const isToday = Boolean(day.isToday || day.key === todayKey);
        return `<article class="dashboard-calendar-day ${day.inMonth ? '' : 'is-muted'} ${isToday ? 'is-today' : ''}" data-calendar-day="${escapeHtml(day.key)}" data-calendar-drop-day="${escapeHtml(day.key)}" ${isToday ? 'aria-current="date"' : ''}>
          <button class="dashboard-calendar-day-head" type="button" ${dayOpenAttr} aria-label="Open ${escapeHtml(day.dateLabel)} content">
            <span class="dashboard-calendar-day-title"><strong>${escapeHtml(day.dayNumber)}</strong>${isToday ? '<em>Today</em>' : ''}</span>
            ${postCount ? `<span>${escapeHtml(postCount)} post${postCount === 1 ? '' : 's'}</span>` : '<span>No posts</span>'}
          </button>
          <div class="dashboard-calendar-mini-list">
            ${visiblePosts.map((post) => `<button class="dashboard-calendar-mini-post" type="button" draggable="true" data-calendar-drag-post="${escapeHtml(post.id)}" data-calendar-post-view="${escapeHtml(post.id)}" title="Drag to another day to reschedule">
              ${statusDot(post.status)}
              <span>${escapeHtml(post.timeLabel)}</span>
              <strong>${escapeHtml(post.title)}</strong>
            </button>`).join('')}
            ${hiddenCount ? `<button class="dashboard-calendar-more" type="button" data-library-day="${escapeHtml(day.key)}">+${escapeHtml(hiddenCount)} more</button>` : ''}
          </div>
        </article>`;
      }).join('')
    : `<article class="empty-state"><h2>Calendar unavailable</h2><p>No calendar days were returned from the server.</p></article>`;

  return `${templateHtml('calendar')}
    <article class="card dashboard-calendar-shell">
      <div class="card-head">
        <div>
          <span class="kicker">real calendar</span>
          <h3>${escapeHtml(monthLabelText)}</h3>
          <p>Every view below is built from real Post records in this workspace. Drag posts to reschedule by day, or use bulk reschedule for selected posts.</p>
        </div>
        <div class="dashboard-calendar-nav">
          ${previousMonth ? `<a class="btn btn-ghost" href="/dashboard/calendar?month=${escapeHtml(previousMonth)}">Previous</a>` : ''}
          <a class="btn btn-ghost" href="/dashboard/calendar">This month</a>
          ${nextMonth ? `<a class="btn btn-ghost" href="/dashboard/calendar?month=${escapeHtml(nextMonth)}">Next</a>` : ''}
        </div>
      </div>
      <div class="dashboard-calendar-view-tabs">${viewTabs}</div>
      ${suggestionBar}
      ${viewMode === 'list' ? '' : `<div class="dashboard-calendar-weekdays">${weekdays.map((day) => `<span>${escapeHtml(day)}</span>`).join('')}</div><div class="dashboard-calendar-grid">${calendarGrid}</div>`}
      <div class="dashboard-calendar-legend">
        ${['scheduled', 'publishing', 'published', 'failed', 'cancelled'].map((status) => `<span>${statusDot(status)}${escapeHtml(status)}</span>`).join('')}
      </div>
    </article>
    <article class="card dashboard-content-library-panel">
      <div class="card-head">
        <div><span class="kicker">content library</span><h3>Real scheduled content</h3><p>No mockups here: this list only uses posts returned from the database for the selected month.</p></div>
        <a class="btn btn-ghost" href="/dashboard/content-library">Content library</a>
      </div>
      ${bulkForm}
      <div class="dashboard-library-list dashboard-library-grid">${realPostList}</div>
    </article>`;
}

function fullComposerHtml() {
  const template = document.getElementById('dashboard-form-full-composer');
  if (!template) return '<p class="empty-state">Full composer template is unavailable.</p>';
  const wrapper = document.createElement('div');
  wrapper.appendChild(template.content.cloneNode(true));
  return wrapper.innerHTML;
}

function initSmartComposer(root = document) {
  const scope = root || document;
  const brandSelect = scope.querySelector('select[name="brand"]');
  const accountOptions = Array.from(scope.querySelectorAll('.target-account-option'));
  const platformOptions = Array.from(scope.querySelectorAll('.platform-option input[name="platforms"]'));
  const accountPlatformGroups = Array.from(scope.querySelectorAll('[data-account-platform-group]'));
  const mediaOptions = Array.from(scope.querySelectorAll('.media-picker-card'));
  const mediaPresetSelect = scope.querySelector('select[name="mediaPreset"]');
  const imageCountSelect = scope.querySelector('select[name="imageCount"]');
  const typeChip = scope.querySelector('[data-preview-type]');
  const countChip = scope.querySelector('[data-preview-count]');
  const stage = scope.querySelector('[data-preview-stage]');
  const captionField = scope.querySelector('textarea[name="caption"]');
  const captionPreview = scope.querySelector('[data-preview-caption]');
  const copyResultButton = scope.querySelector('[data-copy-composer-result]');
  const composerForm = scope.querySelector('form.composer-form') || scope.querySelector('form');
  const mediaEmptyNote = scope.querySelector('[data-intent-empty-note]');

  function syncMediaEmptyNote() {
    if (!mediaEmptyNote) return;
    if (!mediaOptions.length) {
      mediaEmptyNote.hidden = true;
      return;
    }
    const hasVisibleMedia = mediaOptions.some((card) => !card.hidden && card.style.display !== 'none' && !card.classList.contains('is-disabled-by-intent'));
    mediaEmptyNote.hidden = hasVisibleMedia;
  }

  function syncBrandFilters() {
    const brand = brandSelect ? brandSelect.value : '';
    const selectedPlatforms = platformOptions.filter((input) => input.checked).map((input) => input.value);
    accountPlatformGroups.forEach((group) => {
      const platform = group.getAttribute('data-account-platform-group');
      group.style.display = !selectedPlatforms.length || selectedPlatforms.includes(platform) ? '' : 'none';
    });
    accountOptions.forEach((item) => {
      const platformAllowed = !selectedPlatforms.length || selectedPlatforms.includes(item.dataset.platform);
      item.style.display = (!brand || item.dataset.brand === brand) && platformAllowed ? '' : 'none';
    });
    mediaOptions.forEach((item) => {
      // Media can be reused across a user's brands for reposting already generated assets.
      // Format intelligence still hides non-matching images/videos.
      const brandVisible = true;
      item.dataset.brandFiltered = brandVisible ? 'visible' : 'hidden';
      item.style.display = brandVisible ? '' : 'none';
      item.hidden = !brandVisible || item.classList.contains('is-disabled-by-intent');
    });
    syncMediaEmptyNote();
  }

  function parsePreset(value) {
    const preset = String(value || 'image-1');
    if (preset === 'video') return { type: 'video', count: 1, label: 'Video' };
    if (preset === 'text') return { type: 'text', count: 0, label: 'Text only' };
    const match = preset.match(/^(image|carousel)-(\d)$/);
    if (!match) return { type: 'image', count: 1, label: '1 image' };
    const [, type, rawCount] = match;
    const count = Number(rawCount || 1);
    const label = type === 'carousel' ? `${count}-image carousel` : `${count} ${count === 1 ? 'image' : 'images'}`;
    return { type, count, label };
  }

  function selectedThumbs() {
    return mediaOptions
      .filter((card) => card.querySelector('input')?.checked && !card.hidden && card.style.display !== 'none' && !card.classList.contains('is-disabled-by-intent'))
      .map((card) => {
        const image = card.querySelector('img')?.getAttribute('src');
        const video = card.querySelector('video')?.getAttribute('src');
        return { image, video, src: image || video || '', type: video ? 'video' : image ? 'image' : '' };
      })
      .filter((item) => item.src);
  }

  function buildCardMarkup(index, type, src) {
    const title = type === 'carousel' ? `Slide ${index + 1}` : `Image ${index + 1}`;
    const kicker = type === 'carousel' ? 'Swipe left' : 'Brand visual';
    return `
      <article class="${type === 'carousel' ? 'preview-slide' : 'preview-card'} ${src ? 'has-thumb' : ''} ${type === 'carousel' && index > 0 ? 'peek' : ''}">
        ${src ? `<img class="preview-thumb" src="${escapeHtml(src)}" alt="${escapeHtml(title)}">` : ''}
        <div class="${type === 'carousel' ? 'preview-slide-body' : 'preview-card-body'}">
          <div>
            <div class="preview-kicker">${escapeHtml(kicker)}</div>
            <div class="preview-title">${escapeHtml(title)}</div>
          </div>
          <div>
            <div class="preview-text">AutoBrand will generate this ${type === 'carousel' ? 'slide' : 'image'} using your Brand Brain and selected output settings.</div>
            <div class="preview-footer"><span>${index + 1}</span><span>${type === 'carousel' ? 'Swipe ->' : 'Ready to post'}</span></div>
          </div>
        </div>
      </article>`;
  }

  function renderPreview() {
    if (!stage || !mediaPresetSelect) return;
    const { type, count, label } = parsePreset(mediaPresetSelect.value);
    if (typeChip) typeChip.textContent = label;
    if (countChip) countChip.textContent = count ? `${count} ${count === 1 ? 'asset' : 'assets'}` : 'No media assets';
    if (imageCountSelect && count) imageCountSelect.value = String(count);
    const thumbs = selectedThumbs();

    if (type === 'video') {
      const selectedVideo = thumbs.find((item) => item.type === 'video');
      if (selectedVideo) {
        stage.innerHTML = `
          <div class="preview-video has-video">
            <video class="preview-thumb" src="${escapeHtml(selectedVideo.src)}" controls preload="metadata" playsinline></video>
            <div class="preview-video-copy">
              <div class="preview-kicker">Selected video</div>
              <div class="preview-title">Ready for video post</div>
            </div>
          </div>`;
        return;
      }
      const cover = thumbs[0]?.src || '';
      stage.innerHTML = `
        <div class="preview-video ${cover ? 'has-thumb' : ''}">
          ${cover ? `<img class="preview-thumb" src="${escapeHtml(cover)}" alt="Video cover">` : ''}
          <div class="preview-card-body">
            <div class="preview-kicker">Vertical video</div>
            <div class="play-badge">▶</div>
            <div>
              <div class="preview-title">AI video post</div>
              <div class="preview-text">OpenAI plans the script and scenes. Your configured renderer produces the final video post.</div>
            </div>
          </div>
        </div>`;
      return;
    }

    if (type === 'carousel') {
      const slides = Array.from({ length: count }).map((_, index) => buildCardMarkup(index, 'carousel', thumbs[index]?.src || '')).join('');
      stage.innerHTML = `<div class="preview-carousel-track">${slides}</div>`;
      return;
    }

    if (type === 'text') {
      stage.innerHTML = '<div class="preview-image-grid"><article class="preview-card"><div class="preview-card-body"><div><div class="preview-kicker">Text-only post</div><div class="preview-title">Caption-led content</div></div><div class="preview-text">This output sends copy only, without generated media.</div></div></article></div>';
      return;
    }

    const cards = Array.from({ length: count }).map((_, index) => buildCardMarkup(index, 'image', thumbs[index]?.src || '')).join('');
    stage.innerHTML = `<div class="preview-image-grid">${cards}</div>`;
  }

  function syncCaptionPreview() {
    if (!captionPreview || !captionField) return;
    const value = captionField.value.trim();
    captionPreview.textContent = value || 'Your Brand Brain caption preview will appear here.';
  }

  async function copyComposerResult() {
    if (!copyResultButton) return;
    const value = captionField?.value.trim() || captionPreview?.textContent.trim() || '';
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      const previous = copyResultButton.textContent;
      copyResultButton.textContent = 'Copied';
      setTimeout(() => { copyResultButton.textContent = previous; }, 1400);
    } catch (error) {
      copyResultButton.textContent = 'Copy failed';
      setTimeout(() => { copyResultButton.textContent = 'Copy result'; }, 1400);
    }
  }

  composerForm?.addEventListener('composer:intentchange', () => {
    syncBrandFilters();
    renderPreview();
  });
  brandSelect?.addEventListener('change', () => {
    syncBrandFilters();
    renderPreview();
  });
  platformOptions.forEach((input) => input.addEventListener('change', () => {
    syncBrandFilters();
    renderPreview();
  }));
  mediaPresetSelect?.addEventListener('change', renderPreview);
  imageCountSelect?.addEventListener('change', () => {
    const parsed = parsePreset(mediaPresetSelect?.value);
    if (!mediaPresetSelect || parsed.type === 'video' || parsed.type === 'text') return;
    const count = Math.max(parsed.type === 'carousel' ? 2 : 1, Math.min(5, Number(imageCountSelect.value || parsed.count || 1)));
    mediaPresetSelect.value = `${parsed.type}-${count}`;
    renderPreview();
  });
  mediaOptions.forEach((card) => card.querySelector('input')?.addEventListener('change', renderPreview));
  captionField?.addEventListener('input', syncCaptionPreview);
  copyResultButton?.addEventListener('click', copyComposerResult);
  window.AutoBrandComposerIntent?.init(scope);
  syncBrandFilters();
  syncCaptionPreview();
  renderPreview();
}

function openFullComposer() {
  closeModal();
  renderPage('quick-create');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openContentLibrary(dayKeyValue) {
  const day = (dashboardCalendar.days || []).find((item) => item.key === dayKeyValue);
  const posts = day?.posts || [];
  if (posts.length === 1 && posts[0]?.id) {
    openCalendarPostModal(posts[0].id, 'view');
    return;
  }
  modalBackdrop.classList.add('show');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  modalKicker.textContent = 'Content library';
  modalTitle.textContent = day ? day.dateLabel : 'Scheduled content';
  modalBody.innerHTML = posts.length
    ? `<div class="dashboard-library-list modal-library-list modal-day-grid">${posts.map((post) => calendarLibraryPost(post)).join('')}</div>`
    : '<article class="empty-state"><h2>No posts for this day</h2><p>Use the full composer to schedule a real post for this date.</p></article>';
  modalActions.innerHTML = `<button class="btn btn-ghost" type="button" data-close-modal>Close</button><a class="btn btn-primary" href="/dashboard/quick-create">Full composer</a>`;
  bindActions();
}

function renderRows(rows = []) {
  if (!rows.length) return '';
  return `<article class="card"><div class="card-head"><div><h3>Latest data</h3><p>Live records from your workspace database.</p></div></div><div class="data-list">${rows.map(([title, desc, status]) => `
    <div class="data-row"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(desc)}</span></div><span class="badge">${escapeHtml(status)}</span></div>
  `).join('')}</div></article>`;
}

function renderTable(page) {
  const cardRows = Array.isArray(page.cards) ? page.cards.slice(0, 6) : [];
  const rows = cardRows.length ? cardRows : (page.tableRows || []).slice(0, 6);
  const routes = routeMap[currentPage] || routeMap.overview;
  const addControl = routes.modalAction
    ? `<button class="btn btn-primary" type="button" data-action="${escapeHtml(routes.modalAction)}">${icon('plus')}Add record</button>`
    : `<a class="btn btn-primary" href="${pagePath(currentPage)}">${icon('plus')}Add record</a>`;
  if (!rows.length) {
    return `<article class="card"><div class="card-head"><div><h3>Workspace records</h3><p>Current database records aligned to this section.</p></div>${addControl}</div><div class="empty-state"><h2>No rows yet</h2><p>This table will fill from real database records when they exist.</p></div></article>`;
  }
  return `<article class="card"><div class="card-head"><div><h3>Workspace records</h3><p>Current database records aligned to this section.</p></div>${addControl}</div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map((record, index) => {
      const card = normalizeRecordCard(record, index);
      const actions = cardRows.length
        ? cardActionButtons(card, index, routes)
        : `<button class="tool-btn" type="button" data-action="view" data-title="${escapeHtml(card.title)}">View</button>`;
      return `<tr><td>${escapeHtml(card.title)}</td><td>${escapeHtml(card.description)}</td><td><span class="badge">${escapeHtml(card.status || card.tag || 'Record')}</span></td><td>${actions}</td></tr>`;
    }).join('')}</tbody></table></div></article>`;
}




const planLimitFields = [
  ['maxBrands', 'Brands'], ['maxSocialAccounts', 'Social accounts'], ['maxTeamMembers', 'Team members'],
  ['maxScheduledPosts', 'Scheduled posts'], ['maxAutoPosts', 'Auto posts'], ['maxHandoffPosts', 'Handoff posts'],
  ['maxAiTextGenerations', 'AI text generations'], ['maxAiImageGenerations', 'AI images'], ['maxAiVideoGenerations', 'AI videos'],
  ['maxAvatarVideos', 'Avatar videos'], ['maxStorageMb', 'Storage MB'], ['maxClientApprovalLinks', 'Client approval links']
];
const planLevelFields = [
  ['brandBrainLevel', 'Brand Brain level'], ['smartComposerLevel', 'Smart Composer level'], ['analyticsLevel', 'Analytics level']
];
const planFeatureFields = [
  ['calendarAccess', 'Calendar'], ['campaignAccess', 'Campaigns'], ['growthStudioAccess', 'Growth Studio'],
  ['autoModeAccess', 'Auto Mode'], ['handoffModeAccess', 'Handoff Mode'], ['approvalWorkflowAccess', 'Approval workflows'],
  ['clientApprovalPortalAccess', 'Client approval portal'], ['contentRepurposingAccess', 'Content repurposing'], ['bulkCreateAccess', 'Bulk create'],
  ['contentScoreAccess', 'Content score'], ['brandFitCheckerAccess', 'Brand fit checker'], ['riskCheckerAccess', 'Risk checker'],
  ['bestTimeSuggestionAccess', 'Best-time suggestions'], ['competitorWatchAccess', 'Competitor watch'], ['whiteLabelAccess', 'White label'],
  ['prioritySupportAccess', 'Priority support'], ['templateAccess', 'Templates'], ['failedPostRecoveryAccess', 'Failed post recovery'],
  ['agencyWorkspaceAccess', 'Agency workspace']
];
const aiProviderChoices = ['openai', 'gemini', 'deepseek', 'groq', 'anthropic', 'mistral', 'replicate', 'stability', 'fal', 'local'];
const planLevelChoices = ['none', 'basic', 'standard', 'advanced', 'premium', 'unlimited'];

function selectedAttr(value, current) {
  return String(value) === String(current || '') ? 'selected' : '';
}

function checkedAttr(value) {
  return value ? 'checked' : '';
}

function planStateFromUrl() {
  const params = new URLSearchParams(location.search || '');
  return { mode: params.get('mode') || '', view: params.get('view') || '', id: params.get('id') || '' };
}

function findPlan(id) {
  return dashboardAdminPlans.find((plan) => String(plan.id) === String(id) || String(plan.slug) === String(id));
}

function planFeatureList(plan = {}) {
  if (Array.isArray(plan.featureList)) return plan.featureList.join('\n');
  return String(plan.featureList || '');
}

function planFormAction(plan = {}, mode = 'create') {
  return mode === 'edit' && plan.id ? `/dashboard/actions/admin/plans/${encodeURIComponent(plan.id)}` : '/dashboard/actions/admin/plans';
}

function planEditorHtml(plan = {}, mode = 'create') {
  const isEdit = mode === 'edit' && plan.id;
  const limits = plan.limits || {};
  const features = plan.features || {};
  const aiConfig = plan.aiConfig || {};
  const metadata = plan.metadata || {};
  return `<article class="card real-form-card dashboard-plan-editor" id="plan-editor">
    <div class="card-head">
      <div><span class="kicker">${isEdit ? 'Edit dynamic plan' : 'Create dynamic plan'}</span><h3>${escapeHtml(isEdit ? `Edit ${plan.name}` : 'Create plan')}</h3><p>Structured plan settings power landing pricing, signup, checkout, billing, usage limits, feature locks and AI routing.</p></div>
      <a class="btn btn-ghost" href="/dashboard/plans">Back to plans</a>
    </div>
    <form action="${escapeHtml(planFormAction(plan, mode))}" method="post" class="real-form-grid plan-form-grid">
      <input type="hidden" name="_csrf" value="${escapeHtml(dashboardCsrfToken)}">
      ${isEdit ? '<input type="hidden" name="_method" value="PUT">' : ''}
      <section class="form-section full"><h4>Basic plan and pricing</h4><p>Controls public pricing cards and billing handoff.</p></section>
      <label><span>Name</span><input name="name" value="${escapeHtml(plan.name || '')}" required></label>
      <label><span>Slug</span><input name="slug" value="${escapeHtml(plan.slug || '')}" required></label>
      <label class="full"><span>Description</span><textarea name="description" rows="3">${escapeHtml(plan.description || '')}</textarea></label>
      <label><span>Price</span><input name="price" type="number" min="0" step="0.01" value="${escapeHtml(plan.price ?? 0)}"></label>
      <label><span>Currency</span><select name="currency">${['USD','EUR','GBP','NGN','KES','UGX'].map((currency) => `<option value="${currency}" ${selectedAttr(currency, plan.currency || 'USD')}>${currency}</option>`).join('')}</select></label>
      <label><span>Billing interval</span><select name="billingInterval">${['month','year','one_time'].map((interval) => `<option value="${interval}" ${selectedAttr(interval, plan.billingInterval || 'month')}>${escapeHtml(interval.replace('_', ' '))}</option>`).join('')}</select></label>
      <label><span>Trial days</span><input name="trialDays" type="number" min="0" value="${escapeHtml(plan.trialDays ?? 0)}"></label>
      <label><span>Sort order</span><input name="sortOrder" type="number" value="${escapeHtml(plan.sortOrder ?? 100)}"></label>
      <label><span>Queue priority</span><input name="queuePriority" type="number" min="0" max="100" value="${escapeHtml(plan.queuePriority ?? 5)}"></label>
      <label class="checkbox-line"><input name="isActive" type="checkbox" value="on" ${checkedAttr(plan.isActive !== false)}><span>Active</span></label>
      <label class="checkbox-line"><input name="isPublic" type="checkbox" value="on" ${checkedAttr(plan.isPublic !== false)}><span>Show publicly</span></label>
      <label class="checkbox-line"><input name="isPopular" type="checkbox" value="on" ${checkedAttr(plan.isPopular)}><span>Popular badge</span></label>
      <section class="form-section full"><h4>Usage limits</h4><p>Use -1 for unlimited. These limits are enforced by subscription middleware and usage services.</p></section>
      ${planLimitFields.map(([name, label]) => `<label><span>${escapeHtml(label)}</span><input name="limits[${escapeHtml(name)}]" type="number" value="${escapeHtml(limits[name] ?? 0)}"></label>`).join('')}
      <section class="form-section full"><h4>Feature access</h4><p>These toggles control dashboard feature visibility and locked upgrade states.</p></section>
      ${planLevelFields.map(([name, label]) => `<label><span>${escapeHtml(label)}</span><select name="features[${escapeHtml(name)}]">${planLevelChoices.map((choice) => `<option value="${choice}" ${selectedAttr(choice, features[name] || 'basic')}>${escapeHtml(choice)}</option>`).join('')}</select></label>`).join('')}
      <div class="check-grid full">${planFeatureFields.map(([name, label]) => `<label class="checkbox-line"><input name="features[${escapeHtml(name)}]" type="checkbox" value="on" ${checkedAttr(features[name])}><span>${escapeHtml(label)}</span></label>`).join('')}</div>
      <label class="full"><span>Pricing card feature checklist</span><textarea name="featureList" rows="5" placeholder="One feature per line">${escapeHtml(planFeatureList(plan))}</textarea></label>
      <section class="form-section full"><h4>Plan-level AI provider controls</h4><p>Controls allowed providers, defaults, fallback routing, monthly AI limits and whether users can choose a provider.</p></section>
      <label class="full"><span>Allowed providers</span><select name="aiConfig[allowedProviders]" multiple size="6">${aiProviderChoices.map((provider) => `<option value="${provider}" ${(aiConfig.allowedProviders || []).includes(provider) ? 'selected' : ''}>${escapeHtml(provider)}</option>`).join('')}</select></label>
      <label class="full"><span>Allowed models</span><textarea name="aiConfig[allowedModels]" rows="3" placeholder="One model per line">${escapeHtml(Array.isArray(aiConfig.allowedModels) ? aiConfig.allowedModels.join('\n') : aiConfig.allowedModels || '')}</textarea></label>
      ${['defaultTextProvider','defaultImageProvider','defaultVideoProvider','fallbackProvider'].map((name) => `<label><span>${escapeHtml(name.replace(/([A-Z])/g, ' $1'))}</span><select name="aiConfig[${name}]"><option value="">Use platform default</option>${aiProviderChoices.map((provider) => `<option value="${provider}" ${selectedAttr(provider, aiConfig[name])}>${escapeHtml(provider)}</option>`).join('')}</select></label>`).join('')}
      ${['defaultTextModel','defaultImageModel','defaultVideoModel','fallbackModel'].map((name) => `<label><span>${escapeHtml(name.replace(/([A-Z])/g, ' $1'))}</span><input name="aiConfig[${name}]" value="${escapeHtml(aiConfig[name] || '')}"></label>`).join('')}
      <label><span>Monthly token limit</span><input name="aiConfig[monthlyTokenLimit]" type="number" value="${escapeHtml(aiConfig.monthlyTokenLimit ?? '')}"></label>
      <label><span>Monthly image limit</span><input name="aiConfig[monthlyImageLimit]" type="number" value="${escapeHtml(aiConfig.monthlyImageLimit ?? '')}"></label>
      <label><span>Monthly video limit</span><input name="aiConfig[monthlyVideoLimit]" type="number" value="${escapeHtml(aiConfig.monthlyVideoLimit ?? '')}"></label>
      <label class="checkbox-line full"><input name="aiConfig[allowUserProviderSelection]" type="checkbox" value="on" ${checkedAttr(aiConfig.allowUserProviderSelection)}><span>Allow user provider/model selection when plan allows</span></label>
      <section class="form-section full"><h4>Billing and admin metadata</h4><p>Keep provider IDs here while frontend cards continue to use the SubscriptionPlan source.</p></section>
      <label><span>Payment provider plan ID</span><input name="paymentProviderPlanId" value="${escapeHtml(plan.paymentProviderPlanId || '')}"></label>
      <label><span>Tax behavior</span><input name="taxBehavior" value="${escapeHtml(plan.taxBehavior || '')}" placeholder="inclusive or exclusive"></label>
      <label><span>Display badge</span><input name="metadata[displayBadge]" value="${escapeHtml(metadata.displayBadge || '')}"></label>
      <label><span>Support note</span><input name="metadata[supportNote]" value="${escapeHtml(metadata.supportNote || '')}"></label>
      <label class="full"><span>Extra metadata JSON</span><textarea name="metadata[extraJson]" rows="3" placeholder='{"region":"global"}'>${escapeHtml(metadata.extraJson || '')}</textarea></label>
      <div class="form-actions full"><button class="btn btn-primary" type="submit">${isEdit ? 'Save plan' : 'Create plan'}</button><a class="btn btn-ghost" href="/dashboard/plans">Cancel</a></div>
    </form>
  </article>`;
}

function formatPlanLimit(value) {
  if (value === -1 || value === 'unlimited') return 'Unlimited';
  if (value === undefined || value === null || value === '') return '0';
  return String(value);
}

function planCardHtml(plan = {}) {
  const price = Number(plan.price || 0);
  const priceLabel = price ? `${escapeHtml(plan.currency || 'USD')} ${escapeHtml(price.toFixed(price % 1 ? 2 : 0))}` : (plan.trialDays ? 'Free trial' : 'Free');
  const status = plan.deletedAt ? 'Deleted' : plan.isActive ? 'Active' : 'Inactive';
  const publicLabel = plan.isPublic ? 'Public' : 'Hidden';
  const topFeatures = Array.isArray(plan.featureList) && plan.featureList.length
    ? plan.featureList.slice(0, 3)
    : Object.entries(plan.features || {}).filter(([, value]) => value === true || ['advanced', 'premium', 'unlimited'].includes(String(value))).slice(0, 3).map(([key]) => key.replace(/([A-Z])/g, ' $1'));
  return `<article class="plan-pricing-card ${plan.isPopular ? 'is-popular' : ''} ${plan.deletedAt ? 'is-deleted' : ''}">
    <div class="plan-card-topline plan-card-status-line">
      <span class="plan-status-chip ${plan.isActive ? 'is-active' : 'is-muted'}">${escapeHtml(status)}</span>
      <span class="plan-status-chip ${plan.isPublic ? 'is-public' : 'is-muted'}">${escapeHtml(publicLabel)}</span>
      ${plan.isPopular ? '<span class="plan-status-chip is-popular">Popular</span>' : ''}
    </div>
    <div class="plan-card-main">
      <div>
        <h3>${escapeHtml(plan.name || plan.slug || 'Plan')}</h3>
        <p>${escapeHtml(plan.description || 'Dynamic subscription plan')}</p>
      </div>
      <div class="plan-price-row"><strong>${priceLabel}</strong><span>/${escapeHtml(plan.billingInterval || 'month')}</span></div>
    </div>
    <div class="plan-metric-strip plan-metric-strip-compact">
      <span><strong>${escapeHtml(formatPlanLimit(plan.limits?.maxBrands))}</strong> brands</span>
      <span><strong>${escapeHtml(formatPlanLimit(plan.limits?.maxSocialAccounts))}</strong> socials</span>
    </div>
    <ul class="plan-feature-list compact-plan-feature-list">${topFeatures.length ? topFeatures.map((feature) => `<li>${icon('check')}${escapeHtml(feature)}</li>`).join('') : '<li>No public feature checklist yet.</li>'}</ul>
    <div class="plan-card-actions">
      <a class="btn btn-ghost" href="/dashboard/plans?view=${encodeURIComponent(plan.id || plan.slug || '')}">Preview</a>
      <a class="btn btn-primary" href="/dashboard/plans?mode=edit&id=${encodeURIComponent(plan.id || plan.slug || '')}">Edit plan</a>
    </div>
  </article>`;
}

function planViewHtml(plan = {}) {
  if (!plan.id) return `<article class="empty-state"><h2>Plan not found</h2><p>The selected plan could not be found in the dashboard data.</p><a class="btn btn-primary" href="/dashboard/plans">Back to plans</a></article>`;
  const features = Object.entries(plan.features || {}).filter(([, value]) => value === true || value === 'advanced' || value === 'premium' || value === 'unlimited').slice(0, 12);
  return `<article class="card plan-detail-card">
    <div class="card-head">
      <div><span class="kicker">Subscription plan</span><h3>${escapeHtml(plan.name)}</h3><p>${escapeHtml(plan.description || 'Dynamic plan')}</p></div>
      <div class="row-actions"><a class="btn btn-ghost" href="/dashboard/plans">All plans</a><a class="btn btn-primary" href="/dashboard/plans?mode=edit&id=${encodeURIComponent(plan.id)}">Edit</a></div>
    </div>
    <div class="record-detail-grid">
      <div class="record-detail-field"><strong>Slug</strong><span>${escapeHtml(plan.slug)}</span></div>
      <div class="record-detail-field"><strong>Price</strong><span>${escapeHtml(plan.currency || 'USD')} ${escapeHtml(plan.price || 0)} / ${escapeHtml(plan.billingInterval || 'month')}</span></div>
      <div class="record-detail-field"><strong>Status</strong><span>${escapeHtml(plan.deletedAt ? 'Deleted' : plan.isActive ? 'Active' : 'Inactive')}</span></div>
      <div class="record-detail-field"><strong>Public</strong><span>${plan.isPublic ? 'Yes' : 'No'}</span></div>
      <div class="record-detail-field"><strong>Subscriptions</strong><span>${escapeHtml(plan.subscriptionCount || 0)}</span></div>
      <div class="record-detail-field"><strong>Queue priority</strong><span>${escapeHtml(plan.queuePriority ?? 5)}</span></div>
    </div>
    <div class="dashboard-plan-columns">
      <div><h4>Usage limits</h4><ul>${planLimitFields.map(([name, label]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(plan.limits?.[name] ?? 0)}</span></li>`).join('')}</ul></div>
      <div><h4>Enabled features</h4><ul>${features.length ? features.map(([name, value]) => `<li><strong>${escapeHtml(name)}</strong><span>${escapeHtml(value)}</span></li>`).join('') : '<li><span>No advanced features enabled yet.</span></li>'}</ul></div>
    </div>
    <div class="form-actions">
      <form action="/dashboard/actions/admin/plans/${encodeURIComponent(plan.id)}/duplicate" method="post"><input type="hidden" name="_csrf" value="${escapeHtml(dashboardCsrfToken)}"><button class="btn btn-ghost" type="submit">Duplicate</button></form>
      <form action="/dashboard/actions/admin/plans/${encodeURIComponent(plan.id)}/${plan.isActive ? 'deactivate' : 'activate'}" method="post"><input type="hidden" name="_csrf" value="${escapeHtml(dashboardCsrfToken)}"><button class="btn btn-ghost" type="submit">${plan.isActive ? 'Deactivate' : 'Activate'}</button></form>
      <form action="/dashboard/actions/admin/plans/${encodeURIComponent(plan.id)}" method="post" onsubmit="return confirm('Delete or archive this plan? Existing subscriptions stay safe.');"><input type="hidden" name="_csrf" value="${escapeHtml(dashboardCsrfToken)}"><input type="hidden" name="_method" value="DELETE"><button class="btn btn-danger" type="submit">Delete/archive</button></form>
    </div>
  </article>`;
}

function renderPlansDashboard(page = {}) {
  const state = planStateFromUrl();
  if (state.mode === 'create') return planEditorHtml({}, 'create');
  if (state.mode === 'edit') return planEditorHtml(findPlan(state.id) || {}, 'edit');
  if (state.view) return planViewHtml(findPlan(state.view) || {});
  const activePlans = dashboardAdminPlans.filter((plan) => plan.isActive && !plan.deletedAt).length;
  const publicPlans = dashboardAdminPlans.filter((plan) => plan.isPublic && !plan.deletedAt).length;
  const subscribers = dashboardAdminPlans.reduce((total, plan) => total + Number(plan.subscriptionCount || 0), 0);
  const planCards = dashboardAdminPlans.length
    ? dashboardAdminPlans.map(planCardHtml).join('')
    : '<article class="empty-state"><h2>No plans seeded yet</h2><p>Seed the default plan matrix or create a plan from the dashboard.</p></article>';
  return `${templateHtml('plans')}
    <section class="plan-management-shell">
      <article class="plan-management-hero">
        <div>
          <span class="kicker">dynamic plans</span>
          <h3>Plan Management</h3>
          <p>Manage the same SubscriptionPlan records used by landing pricing, signup, checkout, billing, usage limits, locked features, queue priority and AI provider routing.</p>
          <div class="plan-hero-actions">
            <a class="btn btn-primary" href="/dashboard/plans?mode=create">${icon('plus')}Create plan</a>
            <form action="/dashboard/actions/admin/plans/seed" method="post">${csrfInput()}<button class="btn btn-ghost" type="submit">Seed defaults</button></form>
          </div>
        </div>
        <div class="plan-hero-stats">
          <span><strong>${escapeHtml(dashboardAdminPlans.length)}</strong> total plans</span>
          <span><strong>${escapeHtml(activePlans)}</strong> active</span>
          <span><strong>${escapeHtml(publicPlans)}</strong> public</span>
          <span><strong>${escapeHtml(subscribers)}</strong> subscribers</span>
        </div>
      </article>
      <div class="plan-pricing-grid">${planCards}</div>
    </section>`;
}

function renderLockedPage(page, pageId) {
  const info = lockInfo(pageId);
  const planLabel = info.planName || currentPlan.name || roleAccess.planName || 'Current plan';
  return `<article class="card locked-feature-card">
    <div class="locked-feature-icon">${icon('shield')}</div>
    <div class="locked-feature-body">
      <span class="kicker">Plan locked</span>
      <h3>${escapeHtml(page.title || 'Feature locked')}</h3>
      <p>${escapeHtml(info.reason || 'Upgrade or ask an admin to unlock this feature.')}</p>
      <div class="locked-feature-meta">
        <span class="badge">${escapeHtml(planLabel)}</span>
        <span>Feature access follows your subscription and role.</span>
      </div>
      <div class="locked-feature-actions">
        <a class="btn btn-primary" href="${escapeHtml(info.billingUrl || '/dashboard/billing')}">${icon('card')}View billing</a>
        <a class="btn btn-ghost" href="${escapeHtml(info.upgradeUrl || '/pricing')}">Compare plans</a>
      </div>
    </div>
  </article>`;
}

function renderDashboardError(page = {}) {
  const error = page.error || {};
  const code = error.errorCode || error.statusCode || error.status || detailsValue(page.cards?.[0], ['Status']) || '500';
  const title = error.errorTitle || error.title || page.heading || 'Something went wrong';
  const message = error.errorMessage || error.message || page.description || 'Please try again or return to the dashboard.';
  const requestId = error.requestId || 'n/a';
  const primaryHref = error.primaryActionHref || '/dashboard/overview';
  const primaryLabel = error.primaryActionLabel || 'Back to dashboard';
  const secondaryHref = error.secondaryActionHref || '/dashboard/settings';
  const secondaryLabel = error.secondaryActionLabel || 'Open settings';
  const details = error.details || '';
  return `<section class="dashboard-error-page" aria-labelledby="dashboardErrorTitle">
    <article class="panel dashboard-error-card">
      <div class="section-kicker">Error ${escapeHtml(code)}</div>
      <h1 id="dashboardErrorTitle">${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <p class="muted">Request ID: ${escapeHtml(requestId)}</p>
      <div class="row-actions">
        <a class="btn btn-primary" href="${escapeHtml(primaryHref)}">${escapeHtml(primaryLabel)}</a>
        <a class="btn btn-ghost" href="${escapeHtml(secondaryHref)}">${escapeHtml(secondaryLabel)}</a>
      </div>
      ${details ? `<details class="dashboard-error-details"><summary>Development details</summary><pre>${escapeHtml(details)}</pre></details>` : ''}
    </article>
  </section>`;
}


function renderPage(pageId, options = {}) {
  closeModal();
  const resolved = getPage(pageId);
  const page = resolved.page || defaultPage;
  const safePageId = resolved.pageId;
  currentPage = safePageId;
  pageTitle.textContent = page.title || defaultPage.title;
  navLinks.forEach((link) => link.classList.toggle('active', link.dataset.page === safePageId));
  const pageContent = isLockedPage(safePageId)
    ? renderLockedPage(page, safePageId)
    : safePageId === 'brand-brain'
      ? renderBrandBrain(page)
      : safePageId === 'social'
        ? renderSocialDashboard()
      : safePageId === 'calendar'
        ? renderCalendarDashboard(page)
      : safePageId === 'plans'
        ? renderPlansDashboard(page)
      : safePageId === 'content-library'
        ? renderContentLibraryDashboard(page)
      : safePageId === 'media'
        ? renderMediaDashboard(page)
      : safePageId === 'approvals'
        ? renderApprovalsHandoffDashboard(page)
      : safePageId === 'analytics'
        ? renderAnalyticsDashboard(page)
      : safePageId === 'billing'
        ? renderBillingDashboard(page)
      : safePageId === 'errors'
        ? renderDashboardError(page)
      : safePageId === 'quick-create'
        ? `${fullComposerHtml()}
    <article class="card"><div class="card-head"><div><h3>${escapeHtml(page.title)} cards</h3><p>Live records, counts and useful next actions from your workspace.</p></div><span class="badge">${escapeHtml(page.cards?.length || 0)} items</span></div>${renderCards(page.cards)}</article>
    ${renderRows(page.rows)}`
      : `${templateHtml(safePageId)}
    <article class="card"><div class="card-head"><div><h3>${escapeHtml(page.title)} cards</h3><p>Live records, counts and useful next actions from your workspace.</p></div><span class="badge">${escapeHtml(page.cards?.length || 0)} items</span></div>${renderCards(page.cards)}</article>
    ${renderRows(page.rows)}
    ${renderTable(page)}`;
  const searchParams = new URLSearchParams(location.search);
  const queryNotice = dashboardNoticeMarkup(dashboardNoticeFromQuery(searchParams));
  pageRoot.innerHTML = `
    <div class="page-head">
      <div><span class="kicker">${escapeHtml(page.kicker)}</span><h2>${escapeHtml(page.heading)}</h2><p>${escapeHtml(page.description)}</p></div>
      ${actionButtons(page.title)}
    </div>
    ${queryNotice}
    ${renderStats(page.stats)}
    ${pageContent}
  `;
  if (options.updateUrl !== false) {
    const nextPath = pagePath(safePageId);
    if (location.pathname !== nextPath) {
      history.pushState({ pageId: safePageId }, '', nextPath);
    }
  }
  hideDrawer();
  bindActions();
  if (safePageId === 'quick-create') initSmartComposer(pageRoot);
  if (searchInput?.value) applyDashboardSearch(searchInput.value);
  const createdBrand = new URLSearchParams(location.search).get('brand_created');
  if (safePageId === 'brand-brain' && createdBrand) {
    const brandName = new URLSearchParams(location.search).get('brand') || 'Brand';
    openModal('brand-created', brandName);
    history.replaceState({ pageId: safePageId }, '', pagePath(safePageId));
  } else if (safePageId === 'brand-brain') {
    const brandMode = searchParams.get('mode');
    const brandId = searchParams.get('id');
    if (brandMode === 'create') requestAnimationFrame(() => openModal('brand-create'));
    if (brandId && (brandMode === 'view' || brandMode === 'edit')) {
      requestAnimationFrame(() => openModal(brandMode === 'edit' ? 'brand-edit' : 'brand-view', brandId));
    }
  }
  if (safePageId === 'calendar' && searchParams.get('handoff_created')) {
    history.replaceState({ pageId: safePageId }, '', pagePath(safePageId));
  }
  if (location.hash) {
    requestAnimationFrame(() => {
      const target = document.querySelector(location.hash);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function pageIdFromDashboardPath(pathname = '') {
  const clean = String(pathname || '').replace(/^\/dashboard\/?/, '');
  if (clean.startsWith('admin/plans') || clean.startsWith('plans')) return 'plans';
  return normalizePageId(clean.split('/')[0] || 'overview');
}

function openPageFromLink(event) {
  if (isStaticDashboardErrorPage) return;
  event.preventDefault();
  const pageId = normalizePageId(event.currentTarget.dataset.page || pageIdFromDashboardPath(event.currentTarget.getAttribute('href') || ''));
  renderPage(pageId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
navLinks.forEach((link) => link.addEventListener('click', openPageFromLink));

function isDashboardSpaPath(pathname = '') {
  const normalized = pathname.replace(/\/+$/, '') || '/dashboard/overview';
  if (normalized === '/dashboard') return true;
  const parts = normalized.replace(/^\/dashboard\/?/, '').split('/').filter(Boolean);
  if (parts.length !== 1) return false;
  const pageId = normalizePageId(parts[0] || 'overview');
  return Object.prototype.hasOwnProperty.call(pages, pageId) || pageId === 'plans';
}

function bindDashboardLinks() {
  if (isStaticDashboardErrorPage) return;
  document.querySelectorAll('a[href^="/dashboard/"]').forEach((link) => {
    if (link.dataset.dashboardBound === 'true') return;
    link.dataset.dashboardBound = 'true';
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
      const base = (window.location && window.location.origin) || (location && location.origin) || 'http://localhost:3200';
      const url = new URL(link.getAttribute('href') || '', base);
      if (!isDashboardSpaPath(url.pathname)) return;
      event.preventDefault();
      const pageId = pageIdFromDashboardPath(url.pathname);
      history.pushState({ pageId }, '', `${url.pathname}${url.search || ''}${url.hash || ''}`);
      renderPage(pageId, { updateUrl: false });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function detailValueHtml(value) {
  if (value === null || value === undefined || value === '') return '<span>Not saved</span>';
  if (Array.isArray(value)) {
    if (!value.length) return '<span>Not saved</span>';
    return `<ul class="record-detail-list">${value.map((item) => `<li>${detailValueHtml(item)}</li>`).join('')}</ul>`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== '');
    if (!entries.length) return '<span>Not saved</span>';
    return `<div class="record-detail-nested">${entries.map(([key, item]) => `<div><strong>${escapeHtml(key)}</strong>${detailValueHtml(item)}</div>`).join('')}</div>`;
  }
  const text = String(value);
  if (/^https?:\/\//i.test(text)) return `<a href="${escapeHtml(text)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
  return `<span>${escapeHtml(text)}</span>`;
}

function modalMediaHtml(card) {
  const url = safeUrl(card?.mediaUrl);
  if (!url) return '';
  if (isVideoMedia(card)) {
    return `<div class="record-modal-media record-modal-video"><video src="${url}" controls preload="metadata" playsinline></video></div>`;
  }
  if (isImageMedia(card)) {
    return `<div class="record-modal-media"><img src="${url}" alt="${escapeHtml(card.mediaAlt || card.title || 'Record media')}"></div>`;
  }
  return `<div class="record-modal-media record-modal-file"><a class="btn btn-ghost" href="${url}" target="_blank" rel="noopener">Open media file</a></div>`;
}

function cardDetailHtml(card) {
  const details = card.details && typeof card.details === 'object' ? card.details : { Title: card.title, Description: card.description, Status: card.status || card.tag };
  return `<article class="record-modal-card">
    ${modalMediaHtml(card)}
    <div class="record-modal-heading">
      <span class="pill">${iconForTag(card.tag || card.status || card.kind)}${escapeHtml(card.tag || card.status || 'Record')}</span>
      <h3>${escapeHtml(card.title || 'Record')}</h3>
      <p>${escapeHtml(card.description || '')}</p>
    </div>
    <div class="record-detail-grid">
      ${Object.entries(details).map(([key, value]) => `<div class="record-detail-field"><strong>${escapeHtml(key)}</strong>${detailValueHtml(value)}</div>`).join('')}
    </div>
  </article>`;
}

function normalizedFieldValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return value === undefined || value === null ? '' : String(value);
}

function fieldOptionsHtml(field = {}) {
  const options = Array.isArray(field.options) ? field.options : [];
  return options.map((option) => {
    const value = typeof option === 'object' ? option.value : option;
    const label = typeof option === 'object' ? option.label : String(option).replace(/_/g, ' ');
    const selected = String(value) === String(field.value || '') ? 'selected' : '';
    return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(label)}</option>`;
  }).join('');
}

function editFieldHtml(field = {}) {
  const name = field.name || '';
  const label = field.label || name || 'Field';
  const value = normalizedFieldValue(field.value);
  const required = field.required ? 'required' : '';
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
  const full = field.full !== false && (field.type === 'textarea' || String(value).length > 80 || field.full || field.type === 'checkbox') ? ' full' : '';
  if (field.type === 'hidden') return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
  if (field.type === 'checkbox') {
    const checked = field.checked || value === 'true' || value === 'on' || value === '1' || value === 'yes' ? 'checked' : '';
    return `<label class="checkbox-line${full}"><input name="${escapeHtml(name)}" type="checkbox" value="${escapeHtml(field.checkboxValue || 'on')}" ${checked} ${required}><span>${escapeHtml(label)}</span></label>`;
  }
  if (field.type === 'select') {
    return `<label class="${full.trim()}">${escapeHtml(label)}<select name="${escapeHtml(name)}" ${required}>${fieldOptionsHtml(field)}</select></label>`;
  }
  if (field.type === 'textarea') {
    return `<label class="${full.trim() || 'full'}">${escapeHtml(label)}<textarea name="${escapeHtml(name)}" rows="${escapeHtml(field.rows || 4)}"${placeholder} ${required}>${escapeHtml(value)}</textarea></label>`;
  }
  const inputType = field.type || 'text';
  return `<label class="${full.trim()}">${escapeHtml(label)}<input name="${escapeHtml(name)}" type="${escapeHtml(inputType)}" value="${escapeHtml(value)}"${placeholder} ${required}></label>`;
}

function inferredEditFields(card = {}) {
  if (Array.isArray(card.editFields) && card.editFields.length) return card.editFields;
  const details = card.details && typeof card.details === 'object' ? card.details : {};
  return Object.entries(details).slice(0, 12).map(([key, value]) => ({
    name: key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field',
    label: key,
    type: Array.isArray(value) || (value && typeof value === 'object') || String(value || '').length > 90 ? 'textarea' : 'text',
    value,
    full: true,
    readonly: true
  }));
}

function genericEditHtml(card = {}) {
  const fields = inferredEditFields(card);
  const hasAction = Boolean(card.editAction);
  const methodOverride = card.editMethod && ['put', 'patch', 'delete'].includes(String(card.editMethod).toLowerCase())
    ? `<input type="hidden" name="_method" value="${escapeHtml(String(card.editMethod).toUpperCase())}">`
    : '';
  const action = hasAction ? card.editAction : '#';
  const fieldHtml = fields.length
    ? fields.map(editFieldHtml).join('')
    : '<p class="empty-state full">This record has no editable fields yet.</p>';
  const saveButton = hasAction
    ? '<button class="btn btn-primary" type="submit">Save changes</button>'
    : '<button class="btn btn-primary" type="button" disabled>Save unavailable</button>';
  const note = hasAction
    ? ''
    : '<p class="modal-form-note full">This record type does not have a direct update endpoint yet, so the modal shows the saved data without sending you to another page.</p>';
  return `<form action="${escapeHtml(action)}" method="post" class="real-form-grid modal-edit-form record-edit-form">
    ${csrfInput()}
    ${methodOverride}
    ${fieldHtml}
    ${note}
    <div class="real-form-actions full"><button class="btn btn-ghost" type="button" data-close-modal>Cancel</button>${saveButton}</div>
  </form>`;
}


function normalizedCardKind(card = {}) {
  return String(card.kind || card.type || 'record').replace(/_/g, '-').toLowerCase();
}

function actionConfirmText(label = 'this action') {
  return `Continue with ${label}?`;
}

function modalActionForm({ action = '', method = 'post', label = 'Action', className = 'btn btn-ghost', formClass = 'modal-action-form', extraHtml = '', confirmMessage = '' } = {}) {
  if (!action) return '';
  const normalizedMethod = String(method || 'post').toLowerCase();
  const methodOverride = ['put', 'patch', 'delete'].includes(normalizedMethod)
    ? `<input type="hidden" name="_method" value="${escapeHtml(normalizedMethod.toUpperCase())}">`
    : '';
  const confirmAttribute = confirmMessage ? ` data-confirm="${escapeHtml(confirmMessage)}"` : '';
  return `<form action="${escapeHtml(action)}" method="post" class="${escapeHtml(formClass)}"${confirmAttribute}>${csrfInput()}${methodOverride}${extraHtml}<button class="${escapeHtml(className)}" type="submit">${escapeHtml(label)}</button></form>`;
}

function cardScheduleValue(card = {}) {
  const scheduledField = Array.isArray(card.editFields) ? card.editFields.find((field) => field.name === 'scheduledAt') : null;
  if (scheduledField?.value) return scheduledField.value;
  return scheduleDefaultLocalValue();
}

function editModalButton(card = {}, index = -1) {
  if (!canEditCard(card)) return '';
  if (Number.isInteger(Number(index)) && Number(index) >= 0) {
    return `<button class="btn btn-primary" type="button" data-card-action="edit" data-card-index="${Number(index)}">Edit</button>`;
  }
  if (normalizedCardKind(card) === 'post' && card.id) {
    return `<button class="btn btn-primary" type="button" data-calendar-post-edit="${escapeHtml(card.id)}">Edit</button>`;
  }
  return '';
}

function hiddenInputsFromAction(action = {}) {
  const hiddenFields = action.hiddenFields && typeof action.hiddenFields === 'object' ? action.hiddenFields : {};
  return Object.entries(hiddenFields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('');
}

function actionFromRecord(card = {}, action = {}) {
  if (!action || (!action.action && !action.href)) return '';
  const kind = String(action.kind || '').toLowerCase();
  const destructive = action.destructive || ['delete', 'disconnect', 'remove', 'cancel'].includes(kind);
  const className = destructive ? 'btn btn-ghost btn-danger-subtle' : 'btn btn-ghost';
  const label = action.label || 'Action';
  if (!action.action && action.href) {
    return `<a class="${escapeHtml(className)}" href="${escapeHtml(action.href)}">${escapeHtml(label)}</a>`;
  }
  if (kind === 'schedule') {
    const scheduledInput = `<label class="modal-schedule-field"><span>Schedule</span><input name="scheduledAt" type="datetime-local" value="${escapeHtml(cardScheduleValue(card))}" required></label>`;
    return modalActionForm({
      action: action.action,
      method: action.method || 'post',
      label,
      className: 'btn btn-ghost',
      formClass: 'modal-action-form modal-inline-schedule',
      extraHtml: scheduledInput
    });
  }
  return modalActionForm({
    action: action.action,
    method: action.method || 'post',
    label,
    className,
    extraHtml: hiddenInputsFromAction(action),
    confirmMessage: destructive ? actionConfirmText(label) : ''
  });
}

function recordModalActions(card = {}, index = -1) {
  const actions = Array.isArray(card.actions) ? card.actions.filter((action) => action && (action.action || action.href)) : [];
  const renderedActions = actions.map((action) => actionFromRecord(card, action)).join('');
  const alreadyHasDelete = actions.some((action) => action.action === card.deleteAction || (action.kind === 'disconnect' && normalizedCardKind(card) === 'social-account'));
  const deleteAction = card.deleteAction && !alreadyHasDelete
    ? modalActionForm({
        action: card.deleteAction,
        method: card.deleteMethod || 'post',
        label: card.deleteLabel || 'Delete',
        className: 'btn btn-ghost btn-danger-subtle',
        confirmMessage: actionConfirmText(card.deleteLabel || 'Delete')
      })
    : '';
  return `<button class="btn btn-ghost" type="button" data-close-modal>Close</button>${editModalButton(card, index)}${renderedActions}${deleteAction}`;
}

function calendarPostToCard(post = {}) {
  const hashtags = Array.isArray(post.hashtags) ? post.hashtags.join(' ') : (post.hashtags || '');
  return normalizeRecordCard({
    id: post.id || '',
    kind: 'post',
    title: post.title || 'Scheduled post',
    description: post.fullCaption || post.caption || 'No caption saved.',
    tag: post.status || 'draft',
    status: post.status || 'draft',
    mediaUrl: post.mediaUrl || (Array.isArray(post.media) ? post.media.find((item) => item?.url)?.url : ''),
    mediaType: post.mediaType || (Array.isArray(post.media) ? post.media.find((item) => item?.url)?.type : post.type),
    editAction: post.id ? `/dashboard/actions/posts/${post.id}?_method=PUT` : '',
    editMethod: 'post',
    actions: post.id ? [
      { label: post.status === 'published' ? 'Repost' : 'Publish now', action: `/dashboard/actions/posts/${post.id}/publish-now`, method: 'post', kind: 'publish' },
      { label: 'Duplicate', action: `/dashboard/actions/posts/${post.id}/duplicate`, method: 'post', kind: 'duplicate' },
      { label: 'Schedule', action: `/dashboard/actions/posts/${post.id}/schedule`, method: 'post', kind: 'schedule' },
      { label: 'Cancel', action: `/dashboard/actions/posts/${post.id}/cancel`, method: 'post', kind: 'cancel', destructive: true }
    ] : [],
    deleteAction: post.id ? `/dashboard/actions/posts/${post.id}?_method=DELETE` : '',
    deleteLabel: 'Delete post',
    deleteMethod: 'post',
    editFields: [
      { name: 'title', label: 'Title', type: 'text', value: post.title || '', full: true },
      { name: 'caption', label: 'Caption', type: 'textarea', value: post.fullCaption || post.caption || '', rows: 5, full: true },
      { name: 'platform', label: 'Platform', type: 'select', value: post.platform || 'facebook', options: socialPlatforms.map((platform) => platform.key) },
      { name: 'type', label: 'Type', type: 'select', value: post.type || 'text', options: ['text', 'image', 'carousel', 'video', 'reel', 'story', 'link', 'article', 'campaign', 'avatar_video'] },
      { name: 'status', label: 'Status', type: 'select', value: post.status || 'draft', options: ['draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'] },
      { name: 'scheduledAt', label: 'Schedule time', type: 'datetime-local', value: dateTimeLocalValue(post.scheduledAt || '') },
      { name: 'hashtags', label: 'Hashtags', type: 'text', value: hashtags, full: true }
    ],
    details: {
      Brand: post.brandName || 'Missing brand',
      Platform: String(post.platform || '').replace(/_/g, ' '),
      Type: post.type || 'text',
      Status: post.status || 'draft',
      Caption: post.fullCaption || post.caption || '',
      'Scheduled at': post.dateTimeLabel || post.scheduledAt || '',
      'Public URL': post.platformPostUrl || '',
      Targets: (post.targetAccounts || []).map((account) => account.name || account.accountName || '').filter(Boolean),
      Results: (post.publishResults || []).map((result) => [result.accountName, result.status, result.platformPostUrl, result.errorMessage].filter(Boolean).join(' | ')),
      Media: (post.media || []).map((item) => [item.name, item.type, item.url].filter(Boolean).join(' | '))
    }
  });
}

function calendarPostPreviewHtml(post = {}, card = calendarPostToCard(post)) {
  const platformLabel = String(post.platform || 'platform').replace(/_/g, ' ');
  const dateLabel = post.dateTimeLabel || post.dateLabel || 'No date saved';
  const accountList = (post.targetAccounts || []).map((account) => account.name || account.accountName || '').filter(Boolean);
  const resultList = (post.publishResults || []).map((result) => [result.accountName, result.status, result.platformPostUrl, result.errorMessage].filter(Boolean).join(' | ')).filter(Boolean);
  const mediaItems = Array.isArray(post.media) ? post.media.filter((item) => item?.url) : [];
  const mediaPreview = modalMediaHtml(card);
  return `<div class="brand-view-header calendar-post-preview-header">
      <div class="brand-logo-lg post-preview-logo">${platformIcon(post.platform || 'calendar')}</div>
      <div class="brand-view-title">
        <span class="modal-kicker">${escapeHtml(platformLabel)}</span>
        <h3>${escapeHtml(post.title || 'Scheduled post')}</h3>
        <p>${escapeHtml(`${post.brandName || 'Missing brand'} - ${post.status || 'draft'} - ${dateLabel}`)}</p>
        <div class="brand-brain-metrics">
          <span>${escapeHtml(post.type || 'text')}</span>
          <span>${escapeHtml(mediaItems.length ? `${mediaItems.length} media` : 'No media')}</span>
          <span>${escapeHtml(accountList.length ? `${accountList.length} targets` : 'No targets')}</span>
        </div>
      </div>
    </div>
    <div class="brand-view-form calendar-post-preview-form">
      ${card.mediaUrl ? `<section class="brand-detail-section calendar-post-media-section"><h4>Media preview</h4>${mediaPreview}</section>` : ''}
      ${detailGroup('Post copy', [
        detailRow('Caption', escapeHtml(post.fullCaption || post.caption || 'No caption saved.')),
        detailRow('Hashtags', escapeHtml(Array.isArray(post.hashtags) ? post.hashtags.join(' ') : (post.hashtags || 'Not saved')))
      ])}
      ${detailGroup('Schedule and channel', [
        detailRow('Brand', escapeHtml(post.brandName || 'Missing brand')),
        detailRow('Platform', escapeHtml(platformLabel)),
        detailRow('Format', escapeHtml(post.type || 'text')),
        detailRow('Status', escapeHtml(post.status || 'draft')),
        detailRow('Scheduled at', escapeHtml(dateLabel)),
        detailRow('Public URL', post.platformPostUrl ? `<a href="${escapeHtml(post.platformPostUrl)}" target="_blank" rel="noopener">${escapeHtml(post.platformPostUrl)}</a>` : 'Not published')
      ])}
      ${detailGroup('Publishing details', [
        detailRow('Targets', escapeHtml(accountList.join(', ') || 'No target accounts saved')),
        detailRow('Results', escapeHtml(resultList.join(' | ') || 'No publish results yet')),
        detailRow('Media files', escapeHtml(mediaItems.map((item) => [item.name, item.type].filter(Boolean).join(' - ')).join(', ') || 'No attached files'))
      ])}
    </div>`;
}

function openCalendarPostModal(postId, mode = 'view') {
  const post = (dashboardCalendar.posts || []).find((item) => String(item.id) === String(postId));
  if (!post) return;
  const card = calendarPostToCard(post);
  if (mode === 'edit') {
    modalBackdrop.classList.add('show');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    modalKicker.textContent = 'Edit post';
    modalTitle.textContent = card.title || 'Post';
    modalBody.innerHTML = genericEditHtml(card);
    modalActions.innerHTML = '';
    bindActions();
    return;
  }
  modalBackdrop.classList.add('show');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  modalKicker.textContent = 'Post preview';
  modalTitle.textContent = card.title || 'Post';
  modalBody.innerHTML = calendarPostPreviewHtml(post, card);
  modalActions.innerHTML = recordModalActions(card, -1);
  bindActions();
}

function cardByIndex(index) {
  const cards = getPage(currentPage).page.cards || [];
  const parsed = Number(index);
  return Number.isInteger(parsed) && parsed >= 0 ? cards[parsed] : null;
}

function openFrameModal({ title, kicker = 'Edit', src }) {
  modalBackdrop.classList.add('show');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  modalKicker.textContent = kicker;
  modalTitle.textContent = title;
  modalBody.innerHTML = `<iframe class="modal-frame" src="${escapeHtml(src)}" title="${escapeHtml(title)}"></iframe>`;
  modalActions.innerHTML = `<button class="btn btn-ghost" type="button" data-close-modal>Close</button>`;
  bindActions();
}

function openCardModal(index, mode = 'view') {
  const card = cardByIndex(index);
  if (!card) return;
  if (mode === 'edit' && card.kind === 'brand') {
    const brand = brandRecords.find((record) => String(record.id) === String(card.id));
    if (brand) {
      openModal('brand-edit', brand.id);
      return;
    }
  }
  modalBackdrop.classList.add('show');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  modalKicker.textContent = mode === 'edit' ? 'Edit record' : 'Record details';
  modalTitle.textContent = card.title || 'Record';
  modalBody.innerHTML = mode === 'edit' ? genericEditHtml(card) : cardDetailHtml(card);
  modalActions.innerHTML = mode === 'edit' ? '' : recordModalActions(card, Number(index));
  bindActions();
}

function openModal(type, title = currentPageTitle()) {
  const safeTitle = title || currentPageTitle();
  if (type === 'full-composer') {
    openFullComposer();
    return;
  }
  if (type === 'brand-created') {
    modalBackdrop.classList.add('show');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    modalKicker.textContent = 'Saved';
    modalTitle.textContent = 'Brand Brain created';
    modalBody.innerHTML = `<div class="empty-state"><h2>${escapeHtml(title)} is ready</h2><p>Your saved audience, offer, tone, rules and auto-posting data can now feed AI generation without repeat questions.</p></div>`;
    modalActions.innerHTML = `<button class="btn btn-ghost" type="button" data-close-modal>Close</button><a class="btn btn-primary" href="/dashboard/quick-create">Generate content</a>`;
    bindActions();
    return;
  }
  if (type === 'brand-create') {
    modalBackdrop.classList.add('show');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    modalKicker.textContent = 'Create';
    modalTitle.textContent = 'Create Brand Brain';
    modalBody.innerHTML = brandCreateForm();
    modalActions.innerHTML = '';
    bindActions();
    return;
  }
  if (type === 'brand-view' || type === 'brand-edit') {
    const brand = brandRecords.find((record) => record.id === safeTitle);
    if (!brand) return;
    modalBackdrop.classList.add('show');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    modalKicker.textContent = type === 'brand-edit' ? 'Edit Brand Brain' : 'Brand Brain';
    modalTitle.textContent = brand.name;
    modalBody.innerHTML = type === 'brand-edit' ? brandEditForm(brand) : brandDetailHtmlV2(brand);
    modalActions.innerHTML = type === 'brand-edit'
      ? ''
      : `<button class="btn btn-ghost" type="button" data-close-modal>Close</button><button class="btn btn-primary" type="button" data-brand-edit="${escapeHtml(brand.id)}">Edit</button>`;
    bindActions();
    return;
  }
  if (type !== 'view') {
    const routes = routeMap[currentPage] || routeMap.overview;
    const targetPage = normalizePageId((routes.view || routes.primary || '').split('?')[0].replace('/dashboard/', ''));
    renderPage(targetPage || 'overview');
    return;
  }
  const safeType = escapeHtml(type);
  const escapedTitle = escapeHtml(safeTitle);
  const ownerName = escapeHtml(currentUser.name || 'Workspace owner');
  modalBackdrop.classList.add('show');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  modalKicker.textContent = safeType;
  modalTitle.textContent = `${type[0].toUpperCase() + type.slice(1)} ${safeTitle}`;
  if (type === 'view') {
    modalBody.innerHTML = `<div class="data-list">
      <div class="data-row"><div><strong>${escapedTitle}</strong><span>Previewing the current workspace record inside the dashboard.</span></div><span class="badge">Preview</span></div>
      <div class="data-row"><div><strong>Owner</strong><span>${ownerName}</span></div><span class="badge">Active</span></div>
      <div class="data-row"><div><strong>Last updated</strong><span>${escapeHtml(generatedLabel)}</span></div><span class="badge">Recent</span></div>
    </div>`;
    modalActions.innerHTML = `<button class="btn btn-ghost" type="button" data-close-modal>Close</button>`;
  }
  bindActions();
}
function closeModal() {
  modalBackdrop.classList.remove('show');
  modalBackdrop.setAttribute('aria-hidden', 'true');
}
modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (event) => {
  if (event.target === modalBackdrop) closeModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});
function bindScheduleDefaults() {
  document.querySelectorAll('form').forEach((form) => {
    if (form.dataset.scheduleDefaultBound === '1') return;
    form.dataset.scheduleDefaultBound = '1';
    form.addEventListener('submit', (event) => {
      const submitter = event.submitter || document.activeElement;
      const submitterAction = submitter && submitter.name === 'action' ? submitter.value : '';
      const formAction = form.getAttribute('action') || '';
      const isScheduleSubmit = submitterAction === 'schedule'
        || form.classList.contains('modal-inline-schedule')
        || /\/schedule(?:$|[?#])/.test(formAction);
      if (!isScheduleSubmit) return;
      const scheduleInput = form.querySelector('input[name="scheduledAt"]');
      if (scheduleInput && !scheduleInput.value) {
        scheduleInput.value = scheduleDefaultLocalValue();
      }
    }, true);
  });
}

function localTimeForCalendarPost(post) {
  const iso = post?.scheduledAt || post?.publishedAt || post?.createdAt || '';
  if (!iso) return '09:00';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '09:00';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: dashboardTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = formatter.formatToParts(date).reduce((map, part) => {
    if (part.type !== 'literal') map[part.type] = part.value;
    return map;
  }, {});
  return `${parts.hour || '09'}:${parts.minute || '00'}`;
}

function submitCalendarReschedule(postId, dayKey) {
  const post = (dashboardCalendar.posts || []).find((item) => String(item.id) === String(postId));
  if (!post || !dayKey) return;
  const form = document.createElement('form');
  form.method = 'post';
  form.action = `/dashboard/actions/posts/${encodeURIComponent(post.id)}/schedule`;
  form.style.display = 'none';
  form.innerHTML = `${csrfInput()}<input name="scheduledAt" value="${escapeHtml(`${dayKey}T${localTimeForCalendarPost(post)}`)}">`;
  document.body.appendChild(form);
  form.submit();
}

function bindCalendarDragDrop() {
  document.querySelectorAll('[data-calendar-drag-post]').forEach((item) => {
    if (item.dataset.dragBound === '1') return;
    item.dataset.dragBound = '1';
    item.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.dataset.calendarDragPost || '');
      item.classList.add('is-dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('is-dragging');
      document.querySelectorAll('.dashboard-calendar-day.is-drop-target').forEach((day) => day.classList.remove('is-drop-target'));
    });
  });

  document.querySelectorAll('[data-calendar-drop-day]').forEach((day) => {
    if (day.dataset.dropBound === '1') return;
    day.dataset.dropBound = '1';
    day.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      day.classList.add('is-drop-target');
    });
    day.addEventListener('dragleave', () => day.classList.remove('is-drop-target'));
    day.addEventListener('drop', (event) => {
      event.preventDefault();
      day.classList.remove('is-drop-target');
      const postId = event.dataTransfer.getData('text/plain');
      submitCalendarReschedule(postId, day.dataset.calendarDropDay);
    });
  });
}

function bindActions() {
  window.AutoBrandBrandUploads?.init(document);
  window.AutoBrandMediaUploads?.init(document);
  window.AutoBrandComposerIntent?.init(document);
  bindDashboardLinks();
  bindScheduleDefaults();
  bindCalendarDragDrop();
  document.querySelectorAll('[data-card-action]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCardModal(button.dataset.cardIndex, button.dataset.cardAction || 'view');
    };
  });
  document.querySelectorAll('[data-full-composer]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      openFullComposer();
    };
  });
  document.querySelectorAll('[data-library-day]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      openContentLibrary(button.dataset.libraryDay);
    };
  });
  document.querySelectorAll('[data-calendar-best-time]').forEach((button) => {
    if (button.dataset.bestTimeBound === '1') return;
    button.dataset.bestTimeBound = '1';
    button.addEventListener('click', () => {
      const input = document.getElementById('calendarBulkScheduledAt');
      if (input) input.value = dateTimeLocalValue(button.dataset.calendarBestTime);
    });
  });
  document.querySelectorAll('[data-calendar-media]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      const url = safeUrl(button.dataset.calendarMedia || '');
      if (!url) return;
      modalBackdrop.classList.add('show');
      modalBackdrop.setAttribute('aria-hidden', 'false');
      modalKicker.textContent = 'Media';
      modalTitle.textContent = button.getAttribute('aria-label') || 'Post media';
      modalBody.innerHTML = `<div class="record-modal-media"><img src="${url}" alt="Post media"></div>`;
      modalActions.innerHTML = `<button class="btn btn-ghost" type="button" data-close-modal>Close</button><a class="btn btn-primary" href="${url}" target="_blank" rel="noopener">Open file</a>`;
      bindActions();
    };
  });
  document.querySelectorAll('[data-media-search], [data-media-filter]').forEach((control) => {
    control.oninput = control.onchange = () => {
      const root = control.closest('.dashboard-media-shell') || document;
      const term = (root.querySelector('[data-media-search]')?.value || '').trim().toLowerCase();
      const type = root.querySelector('[data-media-filter]')?.value || '';
      root.querySelectorAll('.dashboard-media-card').forEach((card) => {
        const matchesType = !type || card.dataset.mediaType === type;
        const matchesTerm = !term || card.textContent.toLowerCase().includes(term) || String(card.dataset.mediaTags || '').toLowerCase().includes(term) || String(card.dataset.mediaFolder || '').toLowerCase().includes(term);
        card.hidden = !(matchesType && matchesTerm);
      });
    };
  });
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.onclick = () => openModal(button.dataset.action, button.dataset.title || currentPageTitle());
  });
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.onsubmit = (event) => {
      if (!window.confirm(form.dataset.confirm || 'Continue?')) {
        event.preventDefault();
        return false;
      }
      return true;
    };
  });
  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.onclick = closeModal;
  });
  document.querySelectorAll('[data-brand-view]').forEach((button) => {
    button.onclick = () => openModal('brand-view', button.dataset.brandView);
  });
  document.querySelectorAll('[data-brand-edit]').forEach((button) => {
    button.onclick = () => openModal('brand-edit', button.dataset.brandEdit);
  });
  document.querySelectorAll('[data-social-view]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      openSocialAccountModal(button.dataset.socialView);
    };
  });
  document.querySelectorAll('[data-social-edit]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      openSocialEditModal(button.dataset.socialEdit);
    };
  });
  document.querySelectorAll('[data-social-connect]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      openSocialConnectModal(button.dataset.socialConnect);
    };
  });
  document.querySelectorAll('[data-calendar-post-view]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      openCalendarPostModal(button.dataset.calendarPostView, 'view');
    };
  });
  document.querySelectorAll('[data-calendar-post-edit]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      openCalendarPostModal(button.dataset.calendarPostEdit, 'edit');
    };
  });
  document.querySelectorAll('[data-social-platform]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      openSocialPlatformModal(button.dataset.socialPlatform);
    };
  });
}

const dashboardSearchSelector = [
  '.clean-card',
  '.data-row',
  'tbody tr',
  '.dashboard-library-post',
  '.calendar-agenda-row',
  '.dashboard-calendar-mini-post',
  '.dashboard-connected-card',
  '.dashboard-channel-card',
  '.media-card',
  '.plan-pricing-card'
].join(', ');

function syncSearchEmptyState(term = '', items = []) {
  if (!pageRoot) return;
  let emptyState = pageRoot.querySelector('[data-dashboard-search-empty]');
  if (!term) {
    emptyState?.remove();
    return;
  }
  const hasVisibleMatch = items.some((item) => item.style.display !== 'none' && !item.hidden && !item.closest('[hidden]'));
  if (!emptyState) {
    emptyState = document.createElement('article');
    emptyState.className = 'empty-state dashboard-search-empty';
    emptyState.setAttribute('data-dashboard-search-empty', 'true');
    emptyState.innerHTML = '<h2>No matches</h2><p>Try another word or clear search to see all records.</p>';
    pageRoot.appendChild(emptyState);
  }
  emptyState.hidden = hasVisibleMatch;
}

function applyDashboardSearch(value = '') {
  const term = String(value || '').trim().toLowerCase();
  const items = Array.from(document.querySelectorAll(dashboardSearchSelector))
    .filter((item) => !item.closest('template') && !item.closest('#modalBackdrop'));
  items.forEach((item) => {
    item.style.display = !term || item.textContent.toLowerCase().includes(term) ? '' : 'none';
  });
  syncSearchEmptyState(term, items);
}

searchInput?.addEventListener('input', () => {
  applyDashboardSearch(searchInput.value);
});

window.addEventListener('popstate', () => {
  renderPage(pageFromLocation(), { updateUrl: false });
});

if (isStaticDashboardErrorPage && location.pathname !== '/dashboard/errors') {
  history.replaceState({ pageId: 'errors' }, '', '/dashboard/errors');
}
renderPage(pageFromLocation(), { updateUrl: false });

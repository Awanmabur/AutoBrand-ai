const DASHBOARD_ROUTE_ALIASES = {
  ai: 'quick-create',
  'ai-generator': 'quick-create',
  'content-generator': 'quick-create',
  templates: 'video-system',
  'image-workflows': 'media',
  images: 'media',
  'growth-studio': 'campaigns',
  growthstudio: 'campaigns',
  'avatar-consent': 'avatar-video',
  'auto-handoff': 'approvals',
  handoff: 'approvals',
  roles: 'team',
  users: 'team',
  integrations: 'social',
  whatsapp: 'social',
  security: 'settings',
  plans: 'admin/plans'
};

function canonicalDashboardPage(page) {
  const raw = String(page || 'overview').replace(/^dashboard\//, '').replace(/^\/+|\/+$/g, '');
  return DASHBOARD_ROUTE_ALIASES[raw] || raw || 'overview';
}

function dashboardRedirect(page) {
  return (req, res) => res.redirect(303, `/dashboard/${canonicalDashboardPage(page)}`);
}

dashboardRedirect.canonicalDashboardPage = canonicalDashboardPage;

module.exports = dashboardRedirect;

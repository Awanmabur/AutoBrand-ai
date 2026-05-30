const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildPlanPayload } = require('../src/services/admin/planForm.service');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('admin plan form builds structured plan payload without raw JSON textareas', () => {
  const payload = buildPlanPayload({
    name: 'Creator Pro',
    slug: 'Creator-Pro',
    description: 'Advanced creator plan',
    price: '49.99',
    currency: 'usd',
    billingInterval: 'month',
    trialDays: '14',
    isActive: 'on',
    isPublic: 'on',
    sortOrder: '3',
    queuePriority: '8',
    featureList: 'AI video\nClient approvals',
    limits: { maxBrands: '10', maxSocialAccounts: '30', maxAiVideoGenerations: '25', maxStorageMb: '-1' },
    features: { brandBrainLevel: 'advanced', smartComposerLevel: 'premium', analyticsLevel: 'advanced', autoModeAccess: 'on', approvalWorkflowAccess: 'on' },
    aiConfig: {
      allowedProviders: ['openai', 'gemini'],
      allowedModels: 'gpt-4.1-mini\ngemini-2.5-flash',
      defaultTextProvider: 'openai',
      defaultTextModel: 'gpt-4.1-mini',
      defaultImageProvider: 'openai',
      defaultImageModel: 'gpt-image-1',
      fallbackProvider: 'local',
      fallbackModel: 'local-fallback',
      allowUserProviderSelection: 'on',
      monthlyTokenLimit: '5000',
      monthlyImageLimit: '500',
      monthlyVideoLimit: '25'
    },
    metadata: { displayBadge: 'Best value', supportNote: 'Priority', extraJson: '{"region":"global"}' }
  });

  assert.equal(payload.slug, 'creator-pro');
  assert.equal(payload.price, 49.99);
  assert.equal(payload.limits.maxBrands, 10);
  assert.equal(payload.limits.maxStorageMb, -1);
  assert.equal(payload.features.autoModeAccess, true);
  assert.equal(payload.features.calendarAccess, false);
  assert.deepEqual(payload.aiConfig.allowedProviders, ['openai', 'gemini']);
  assert.deepEqual(payload.aiConfig.allowedModels, ['gpt-4.1-mini', 'gemini-2.5-flash']);
  assert.equal(payload.aiConfig.allowUserProviderSelection, true);
  assert.equal(payload.metadata.region, 'global');
});

test('plan management is dashboard-native, structured, and no old overlay EJS remains', () => {
  const js = read('public/js/dashboard-experience.js');
  assert.match(js, /function renderPlansDashboard/);
  assert.match(js, /function planEditorHtml/);
  assert.match(js, /Usage limits/);
  assert.match(js, /Feature access/);
  assert.match(js, /Plan-level AI provider controls/);
  assert.match(js, /name=\"limits\[/);
  assert.match(js, /name=\"features\[/);
  assert.match(js, /name=\"aiConfig\[/);
  assert.doesNotMatch(js, /Limits JSON|Features JSON|AI config JSON/);
  assert.equal(fs.existsSync(path.join(root, 'src/views/dashboard/pages/admin/plans')), false);
});

test('old project branding is removed from frontend templates', () => {
  for (const file of ['src/views/layouts/auth.ejs', 'src/views/layouts/dashboard.ejs', 'src/views/dashboard/experience.ejs', 'src/views/public/landing.ejs', 'src/views/auth/forgot.ejs', 'src/views/auth/reset.ejs']) {
    const content = read(file);
    assert.equal(content.includes('Classic AI'), false, `${file} still contains old product name`);
    assert.equal(content.includes('Classic AI Autobrand'), false, `${file} still contains old product name`);
  }
});

test('oversized legacy controllers now delegate through module files', () => {
  for (const file of ['src/controllers/dashboardController.js', 'src/controllers/postController.js', 'src/controllers/socialController.js']) {
    assert.match(read(file).trim(), /^module\.exports = require\('\.\.\/modules\//);
  }
});

test('controllers do not import legacy aiProviderService directly', () => {
  const offenders = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && fs.readFileSync(full, 'utf8').includes('aiProviderService')) offenders.push(path.relative(root, full));
    }
  }
  ['src/controllers', 'src/modules'].forEach((dir) => walk(path.join(root, dir)));
  assert.deepEqual(offenders, []);
});

test('legacy standalone GET routes redirect into the single dashboard shell', () => {
  const expected = {
    'src/routes/brands.js': ["dashboardRedirect('brand-brain')"],
    'src/routes/posts.js': ["dashboardRedirect('quick-create')", "dashboardRedirect('content-library')", "dashboardRedirect('approvals')"],
    'src/routes/social.js': ["dashboardRedirect('social')"],
    'src/routes/ai.js': ["dashboardRedirect('quick-create')"],
    'src/routes/media.js': ["dashboardRedirect('media')"],
    'src/routes/videos.js': ["dashboardRedirect('video-system')"],
    'src/routes/templates.js': ["dashboardRedirect('video-system')"],
    'src/routes/calendar.js': ["dashboardRedirect('calendar')"],
    'src/routes/campaigns.js': ["dashboardRedirect('campaigns')"],
    'src/routes/growthStudio.js': ["dashboardRedirect('campaigns')"],
    'src/routes/team.js': ["dashboardRedirect('team')"],
    'src/routes/settings.js': ["dashboardRedirect('settings')"],
    'src/routes/analytics.js': ["dashboardRedirect('analytics')"],
    'src/routes/notifications.js': ["dashboardRedirect('notifications')"]
  };
  for (const [file, snippets] of Object.entries(expected)) {
    const content = read(file);
    for (const snippet of snippets) assert.match(content, new RegExp(snippet.replace(/[()']/g, '\\$&')));
  }
});

test('full composer opens from the dashboard template and legacy /posts/new keeps embedded support only', () => {
  const js = read('public/js/dashboard-experience.js');
  const dashboard = read('src/views/dashboard/experience.ejs');
  const postsRoute = read('src/routes/posts.js');
  assert.match(dashboard, /id=\"dashboard-form-full-composer\"/);
  assert.match(js, /function fullComposerHtml\(\)/);
  assert.match(js, /function openFullComposer\(\)/);
  assert.match(js, /modalBody\.innerHTML = fullComposerHtml\(\)/);
  assert.match(js, /safePageId === 'quick-create'/);
  assert.match(postsRoute, /embedded === '1'/);
  assert.match(postsRoute, /postController\.newPost/);
  assert.doesNotMatch(js, /fetch\(['"]\/posts\/new\?embedded=1/);
});

test('plan page uses /dashboard/plans and old plan GET URLs redirect there', () => {
  const js = read('public/js/dashboard-experience.js');
  const layout = read('src/views/layouts/dashboard.ejs');
  const dashboard = read('src/views/dashboard/experience.ejs');
  const controller = read('src/controllers/adminPlanController.js');
  const dashboardRoutes = read('src/routes/dashboard.js');
  const adminRoutes = read('src/routes/admin.js');
  const app = read('src/app.js');

  assert.match(layout, /\/dashboard\/plans/);
  assert.match(dashboard, /href=\"\/dashboard\/plans/);
  assert.match(controller, /return '\/dashboard\/plans'/);
  assert.doesNotMatch(controller, /res\.render\('dashboard\/pages\/admin\/plans/);
  assert.match(dashboardRoutes, /router\.get\('\/admin\/plans', requirePermission\('plans\.view'\), \(req, res\) => res\.redirect\(303, '\/dashboard\/plans'\)\)/);
  assert.match(adminRoutes, /res\.redirect\(303, '\/dashboard\/plans'/);
  assert.match(app, /\/dashboard\/plans/);
  assert.doesNotMatch(js, /\/dashboard\/admin\/plans/);
});

test('merged dashboard navigation has no active duplicate page links', () => {
  const activeLinks = `${read('src/views/dashboard/experience.ejs')}\n${read('src/views/layouts/dashboard.ejs')}\n${read('public/js/dashboard-experience.js')}`;
  for (const stale of ['/dashboard/content-generator','/dashboard/ai-generator','/dashboard/image-workflows','/dashboard/templates','/dashboard/growth-studio','/dashboard/avatar-consent','/dashboard/auto-handoff','/dashboard/integrations','/dashboard/whatsapp','/dashboard/security','/dashboard/roles','/dashboard/users']) {
    assert.equal(activeLinks.includes(`href="${stale}"`) || activeLinks.includes(`href: '${stale}'`), false, `${stale} is still linked as a standalone page`);
  }
});

test('dashboard EJS includes point to files that exist', () => {
  const viewsRoot = path.join(root, 'src/views');
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ejs')) files.push(full);
    }
  }
  walk(viewsRoot);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/include\(['"]([^'"]+)['"]\)/g)) {
      const includePath = match[1];
      const candidates = [];
      if (includePath.startsWith('/')) candidates.push(path.join(viewsRoot, `${includePath}.ejs`));
      else candidates.push(path.join(path.dirname(file), `${includePath}.ejs`));
      candidates.push(path.join(viewsRoot, `${includePath}.ejs`));
      assert.ok(candidates.some((candidate) => fs.existsSync(candidate)), `${path.relative(viewsRoot, file)} includes missing partial ${includePath}`);
    }
  }
});

test('full composer dashboard uses the restored shared composer design', () => {
  const dashboard = read('src/views/dashboard/experience.ejs');
  const partial = read('src/views/dashboard/partials/full-composer.ejs');
  const postView = read('src/views/posts/new.ejs');
  const css = read('public/css/dashboard-experience.css');
  assert.match(dashboard, /include\('partials\/full-composer'/);
  assert.match(dashboard, /classic-composer-modal dashboard-full-composer-shell/);
  assert.match(postView, /include\('\.\.\/dashboard\/partials\/full-composer'/);
  assert.match(partial, /composer-hero/);
  assert.match(partial, /Output preview/);
  assert.match(partial, /Use uploaded media or URLs/);
  assert.match(css, /\.classic-composer-modal \.composer-hero/);
});

test('content library and media use the same media-card renderer', () => {
  const js = read('public/js/dashboard-experience.js');
  const controller = read('src/modules/dashboard/dashboard.controller.js');
  const css = read('public/css/dashboard-experience.css');
  assert.match(js, /function mediaLibraryCard/);
  assert.match(js, /function mediaLibraryGrid/);
  assert.match(js, /function renderMediaDashboard/);
  assert.match(js, /function renderContentLibraryDashboard/);
  assert.match(js, /function renderMediaLibraryShell/);
  const contentLibraryBlock = js.match(/function renderContentLibraryDashboard[\s\S]*?function renderApprovalsHandoffDashboard/)[0];
  assert.match(contentLibraryBlock, /renderMediaLibraryShell/);
  assert.doesNotMatch(contentLibraryBlock, /renderRows\(page\.rows\)/);
  assert.match(js, /safePageId === 'content-library'[\s\S]*renderContentLibraryDashboard\(page\)/);
  assert.match(js, /safePageId === 'media'[\s\S]*renderMediaDashboard\(page\)/);
  assert.match(controller, /mediaListFromRecords/);
  assert.match(controller, /media: postMedia/);
  assert.match(css, /Media & Images shared card layout used by both Media Library and Content Library/);
  assert.match(css, /\.dashboard-media-library-grid \.media-card/);
  assert.doesNotMatch(js, /dashboard-content-media-grid/);
  assert.doesNotMatch(js, /dashboard-post-gallery/);
  assert.doesNotMatch(css, /\.dashboard-content-media-grid/);
  assert.doesNotMatch(css, /\.dashboard-post-gallery/);
});

test('plan management has compact dashboard-native pricing-card design styles', () => {
  const js = read('public/js/dashboard-experience.js');
  const css = read('public/css/dashboard-experience.css');
  assert.match(js, /plan-management-hero/);
  assert.match(js, /plan-pricing-grid/);
  assert.match(js, /plan-pricing-card/);
  assert.match(js, /plan-status-chip/);
  assert.match(js, /plan-metric-strip-compact/);
  assert.match(js, /featureList\.slice\(0, 3\)/);
  assert.match(js, /routeMap[\s\S]*plans: \{ primary: '\/dashboard\/plans\?mode=create'/);
  assert.match(css, /\.plan-management-hero/);
  assert.match(css, /\.plan-pricing-grid/);
  assert.match(css, /\.plan-pricing-card::after[\s\S]*content: none !important/);
  assert.match(css, /\.plan-status-chip/);
  assert.match(css, /\.dashboard-plan-editor/);
});


test('composer intent hides unrelated media, output, and AI controls by selected format', () => {
  const intent = read('public/js/composer-intent.js');
  const partial = read('src/views/dashboard/partials/full-composer.ejs');
  const dashboard = read('public/js/dashboard-experience.js');
  const postView = read('src/views/posts/new.ejs');
  assert.match(intent, /option\.hidden = !allowed/);
  assert.match(intent, /card\.hidden = !visible/);
  assert.match(intent, /showElement\(existingMediaSection, mediaFieldsAllowed\)/);
  assert.match(intent, /showElement\(aiMediaSection, showImageTools \|\| showVideoTools\)/);
  assert.match(intent, /Video output: only video media/);
  assert.match(intent, /Image output: only image assets/);
  assert.match(intent, /Carousel output: only image slides/);
  assert.match(partial, /data-intent-section="ai-media"/);
  assert.match(partial, /data-intent-group="video">Video title/);
  assert.match(partial, /data-intent-group="image">Alt text/);
  assert.match(dashboard, /dataset\.brandFiltered/);
  assert.match(postView, /dataset\.brandFiltered/);
});


test('requested dashboard pages keep restored designs and cleaner billing flow', () => {
  const js = read('public/js/dashboard-experience.js');
  const dashboard = read('src/views/dashboard/experience.ejs');
  const css = read('public/css/dashboard-experience.css');
  assert.match(js, /function renderApprovalsHandoffDashboard/);
  assert.match(js, /function renderBillingDashboard/);
  assert.match(dashboard, /handoff-workspace-shell/);
  assert.match(dashboard, /Generate the schedule from Brand Brain/);
  assert.match(dashboard, /<template id="dashboard-form-billing"><\/template>/);
  assert.match(css, /\.handoff-hero-card/);
  assert.match(css, /\.billing-clean-shell/);
  assert.doesNotMatch(dashboard, /<label>Plan<select name="plan">/);
});

test('composer media picker shows reusable videos when video format is selected', () => {
  const dashboardJs = read('public/js/dashboard-experience.js');
  const postView = read('src/views/posts/new.ejs');
  const partial = read('src/views/dashboard/partials/full-composer.ejs');
  const controller = read('src/modules/dashboard/dashboard.controller.js');
  assert.match(dashboardJs, /Media can be reused across a user's brands/);
  assert.match(postView, /Users can reuse already generated\/uploaded media/);
  assert.match(partial, /inferredMediaType/);
  assert.match(partial, /data-media-type="<%= inferredMediaType %>"/);
  assert.match(controller, /Media\.find\(\{ uploadedBy: userId \}\)[\s\S]*\.limit\(80\)/);
});

test('landing pricing keeps three plan cards per row on desktop', () => {
  const landing = read('src/views/public/landing.ejs');
  assert.match(landing, /\.pricing-grid \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(landing, /@media \(max-width: 980px\) \{[\s\S]*\.pricing-grid \{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(landing, /@media \(max-width: 700px\) \{[\s\S]*\.pricing-grid \{[\s\S]*grid-template-columns: 1fr/);
});

test('landing core features show three cards per row and plan preview is responsive', () => {
  const landing = read('src/views/public/landing.ejs');
  assert.match(landing, /\.feature-grid \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(landing, /@media \(max-width: 700px\) \{[\s\S]*\.feature-grid,[\s\S]*\.pricing-grid \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(landing, /\.plan-detail-layout \{[\s\S]*grid-template-columns: minmax\(280px, 0\.72fr\) minmax\(0, 1fr\)/);
  assert.match(landing, /@media \(max-width: 980px\) \{[\s\S]*\.plan-detail-layout \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(landing, /\.comparison-scroll \{[\s\S]*overflow-x: auto/);
});

test('public pricing and plan details use the same landing design with dynamic database plans', () => {
  const pricingService = read('src/services/pricing.service.js');
  const planDisplay = read('src/services/planDisplay.service.js');
  const publicController = read('src/controllers/publicController.js');
  const publicRoutes = read('src/routes/public.js');
  const landing = read('src/views/public/landing.ejs');
  assert.match(pricingService, /getPublicPricingCards/);
  assert.doesNotMatch(pricingService, /getPublicPricingPlan/);
  assert.match(planDisplay, /viewUrl: `\/pricing\/\$\{encodeURIComponent\(slug\)\}`/);
  assert.match(planDisplay, /limitList: buildLimitList\(limits\)/);
  assert.match(publicController, /renderLanding\(req, res, next, \{ initialPublicPage: 'pricingPage'/);
  assert.match(publicController, /initialPublicPage: 'planDetailPage'/);
  assert.match(publicRoutes, /router\.get\('\/pricing\/:planSlug', publicController\.planDetails\)/);
  assert.match(landing, /id="pricingPage"/);
  assert.match(landing, /id="planDetailPage"/);
  assert.match(landing, /planComparisonRows/);
  assert.match(landing, /selectedPlan\.limitList/);
  assert.match(landing, /plan\.viewUrl/);
  assert.doesNotMatch(landing, /slice\(0, 3\)\.forEach/);
  assert.equal(fs.existsSync(path.join(root, 'src/views/public/pricing.ejs')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/views/public/plan-details.ejs')), false);
});

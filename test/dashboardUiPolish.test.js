const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('dashboard page polish keeps notices, search, and modal links usable', () => {
  const js = read('public/js/dashboard-experience.js');
  const searchBlock = js.match(/const dashboardSearchSelector[\s\S]*?function syncSearchEmptyState/)?.[0] || '';

  assert.match(js, /function dashboardNoticeFromQuery/);
  assert.match(js, /activated: \{ kind: 'success'/);
  assert.match(js, /facebook_setup: \{ kind: 'warning'/);
  assert.match(js, /dashboardNoticeMessages/);
  assert.match(js, /function dashboardNoticeMarkup/);
  assert.match(js, /data-dashboard-search-empty/);
  assert.match(js, /searchInput\?\.addEventListener\('input'/);
  assert.match(searchBlock, /dashboard-calendar-mini-post/);
  assert.doesNotMatch(searchBlock, /dashboard-calendar-day/);
  assert.match(js, /!action\.action && action\.href/);
  assert.match(js, /action && \(action\.action \|\| action\.href\)/);
});

test('composer and dashboard templates include restored empty states and admin operation copy', () => {
  const js = read('public/js/dashboard-experience.js');
  const dashboard = read('src/views/dashboard/experience.ejs');
  const composer = read('src/views/dashboard/partials/full-composer.ejs');
  const css = read('public/css/dashboard-experience.css');

  assert.match(js, /function syncMediaEmptyNote/);
  assert.match(js, /card\.querySelector\('input'\)\?\.checked && !card\.hidden/);
  assert.match(composer, /data-intent-empty-note/);
  assert.match(composer, /alt="<%= item\.fileName \|\| 'Media asset' %>"/);
  assert.match(dashboard, /AI usage, failed jobs, connected accounts, provider readiness/);
  assert.match(css, /\.dashboard-notice\.success/);
  assert.match(css, /\.dashboard-notice\.warning/);
  assert.match(css, /\.dashboard-search-empty/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.notification-popover/);
  assert.match(css, /\.billing-progress-wrap progress/);
});

test('media library controls are styled and hidden dashboard errors are registered', () => {
  const js = read('public/js/dashboard-experience.js');
  const css = read('public/css/dashboard-experience.css');
  const dashboard = read('src/views/dashboard/experience.ejs');
  const featureAccess = read('src/services/subscription/featureAccess.service.js');
  const dashboardController = read('src/modules/dashboard/dashboard.controller.js');
  const errorMiddleware = read('src/middlewares/error.middleware.js');

  assert.match(css, /\.media-filter-bar[\s\S]*border-radius: var\(--radius-lg\)/);
  assert.match(css, /\.media-filter-bar input,[\s\S]*\.media-filter-bar select[\s\S]*min-height: 46px/);
  assert.match(css, /\.dashboard-media-library-grid \.media-card,[\s\S]*\.dashboard-media-card[\s\S]*border-radius: var\(--radius-lg\)/);
  assert.match(css, /\.dashboard-calendar-shell input:not/);
  assert.match(css, /\.calendar-bulk-form[\s\S]*grid-template-columns: minmax\(220px, 1\.35fr\)/);
  assert.match(css, /\.calendar-bulk-form \.calendar-bulk-input[\s\S]*min-height: 46px/);
  assert.match(css, /\.calendar-bulk-form \.calendar-bulk-input\[type="datetime-local"\][\s\S]*min-width: 0/);
  assert.match(css, /#calendarBulkRescheduleForm \.calendar-bulk-input[\s\S]*min-height: 48px/);
  assert.match(css, /#calendarBulkRescheduleForm \.calendar-bulk-input::-webkit-calendar-picker-indicator/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.calendar-bulk-form \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(css, /\.content-filter-row input:not/);
  assert.match(css, /\.modal \{[\s\S]*overflow: hidden[\s\S]*display: flex/);
  assert.match(css, /\.modal-body \{[\s\S]*overflow: auto/);
  assert.match(css, /\.record-detail-grid \{[\s\S]*auto-fit/);
  assert.match(css, /\.calendar-post-preview-header/);
  assert.match(js, /errors: \{ primary: '\/dashboard\/overview'/);
  assert.match(js, /function renderDashboardError/);
  assert.match(js, /function calendarPostPreviewHtml/);
  assert.match(js, /modalBody\.innerHTML = calendarPostPreviewHtml/);
  assert.match(js, /class="calendar-bulk-field"/);
  assert.match(js, /class="calendar-bulk-input"/);
  assert.match(js, /isStaticDashboardErrorPage && liveData\.initialPage/);
  assert.match(js, /history\.replaceState\(\{ pageId: 'errors' \}, '', '\/dashboard\/errors'\)/);
  assert.match(dashboard, /initialDashboardError/);
  assert.match(dashboard, /dashboard-error-page/);
  assert.match(featureAccess, /errors: \{ always: true \}/);
  assert.match(featureAccess, /'dashboard-error': 'errors'/);
  assert.match(dashboardController, /dashboardErrorFromRequest/);
  assert.match(dashboardController, /errors: \{\s*stats:/);
  assert.match(errorMiddleware, /renderDashboardExperienceError/);
  assert.match(errorMiddleware, /req\.user \|\| isDashboardRequest\(req\) \|\| removedRootRouteTarget\(req\.path\)/);
});

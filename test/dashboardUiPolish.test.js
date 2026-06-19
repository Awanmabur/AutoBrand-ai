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

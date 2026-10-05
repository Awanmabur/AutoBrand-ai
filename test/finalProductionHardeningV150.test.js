const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('production auth cookies use __Host names while retaining legacy migration reads', () => {
  const result = spawnSync(process.execPath, ['-e', `process.env.NODE_ENV='production'; process.env.APP_URL='https://autobrand.example'; process.env.PUBLIC_APP_URL='https://autobrand.example'; const a=require('./src/services/authService'); process.stdout.write(JSON.stringify({a:a.accessCookieName,r:a.refreshCookieName,la:a.legacyAccessCookieName,lr:a.legacyRefreshCookieName}));`], { cwd: ROOT, encoding:'utf8' });
  assert.equal(result.status,0,result.stderr);
  const names=JSON.parse(result.stdout);
  assert.equal(names.a,'__Host-autobrand-access');
  assert.equal(names.r,'__Host-autobrand-refresh');
  assert.equal(names.la,'accessToken');
  assert.equal(names.lr,'refreshToken');
});

test('request logging strips query strings and redacts sensitive path tokens', () => {
  const logger = require('../src/middlewares/safeRequestLogger');
  assert.equal(logger.safePath({ originalUrl:'/auth/reset-password?token=secret-value' }),'/auth/reset-password');
  assert.equal(logger.safePath({ originalUrl:'/review/abc123?decision=approve' }),'/review/[redacted]');
  assert.equal(logger.safePath({ originalUrl:'/uploads/drive/asset123/token456/file.png' }),'/uploads/drive/asset123/[redacted]/file.png');
});

test('private application areas are explicitly noindex', () => {
  const noIndex = require('../src/middlewares/noIndexPrivate');
  for (const route of ['/auth/login','/dashboard/overview','/mcp','/review/token','/uploads/drive/a/b','/healthz']) assert.equal(noIndex.isPrivatePath(route),true,route);
  for (const route of ['/','/features','/pricing','/security']) assert.equal(noIndex.isPrivatePath(route),false,route);
});

test('remote media safety blocks active SVG/HTML and detects common signature mismatches', () => {
  const media = require('../src/services/remoteFetch.service');
  assert.equal(media.isBlockedMime('image/svg+xml'),true);
  assert.equal(media.isBlockedMime('text/html'),true);
  assert.equal(media.mediaSignatureMatches(Buffer.from('<html>oops</html>'),'image/png'),false);
  assert.equal(media.mediaSignatureMatches(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),'image/png'),true);
});

test('public site has canonical SEO, AI discovery, sitemap, security and real public forms', () => {
  const routes=read('src/routes/public.js');
  const discovery=read('src/routes/discovery.js');
  const landing=read('src/views/public/landing.ejs');
  const seoPage=read('src/views/public/seoPage.ejs');
  for (const route of ["'/sitemap.xml'","'/features'","'/contact'"]) assert.ok(routes.includes(route),route);
  for (const route of ["'/robots.txt'","'/llms.txt'","'/.well-known/security.txt'"]) assert.ok(discovery.includes(route),route);
  for (const snippet of ['rel="canonical"','property="og:title"','name="twitter:card"','/llms.txt','manifest.webmanifest']) assert.ok(landing.includes(snippet),snippet);
  assert.ok(seoPage.includes('application/ld+json'));
  assert.ok(seoPage.includes('method="post" action="/contact"'));
  assert.ok(!landing.includes('76% approved'));
  assert.ok(!read('src/services/publicSite.service.js').includes('AggregateOffer'));
  assert.ok(read('src/app.js').indexOf("app.use('/', discoveryRoutes)") < read('src/app.js').indexOf('app.use(databaseAvailability)'));
  assert.ok(read('src/controllers/publicController.js').includes('User-agent: OAI-SearchBot'));
  assert.ok(read('src/controllers/publicController.js').includes('User-agent: OAI-AdsBot'));
  assert.ok(read('src/controllers/publicController.js').includes('User-agent: GPTBot'));
  assert.ok(landing.includes('/js/public-shell.js'));
  assert.ok(seoPage.includes('/js/public-shell.js'));
});

test('landing no longer embeds duplicate hidden legal/help/about pseudo-pages', () => {
  const landing=read('src/views/public/landing.ejs');
  const pageIds=[...landing.matchAll(/id="([A-Za-z0-9]+Page)"/g)].map((m)=>m[1]);
  assert.deepEqual(pageIds.sort(),['homePage','planDetailPage','pricingPage'].sort());
});

test('strict CSP has no inline event handlers and style elements carry CSP nonces', () => {
  const app=read('src/app.js');
  assert.ok(app.includes('styleSrcElem'));
  assert.ok(app.includes("frameAncestors: [\"'none'\"]"));
  for (const file of ['src/views/public/landing.ejs','src/views/dashboard/channel-workspace.ejs']) {
    assert.doesNotMatch(read(file),/\son(?:click|change|load|error|submit|input)=/i,file);
  }
  const landing = read('src/views/public/landing.ejs');
  const styleTags = [...landing.matchAll(/<style\b[^>]*>/gi)].map((match) => match[0]);
  for (const tag of styleTags) assert.ok(tag.includes('nonce="<%= cspNonce %>"'), tag);
});

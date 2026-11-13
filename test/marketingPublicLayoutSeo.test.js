const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { PUBLIC_PAGES } = require('../src/services/publicSite.service');

const root = path.resolve(__dirname, '..');
const get = file => fs.readFileSync(path.join(root, file), 'utf8');
const secondaryPath = path.join(root, 'src/views/public/seoPage.ejs');

test('landing and all secondary marketing pages share the exact same header and footer partials', () => {
  const landing = get('src/views/public/landing.ejs');
  const secondary = get('src/views/public/seoPage.ejs');
  const nav = get('src/views/public/partials/marketing-nav.ejs');
  const footer = get('src/views/public/partials/marketing-footer.ejs');
  for (const source of [landing, secondary]) {
    assert.match(source, /include\('partials\/marketing-nav'\)/);
    assert.match(source, /include\('partials\/marketing-footer'\)/);
  }
  assert.match(nav, /id="navLinks"/);
  assert.match(nav, /id="mobileToggle"/);
  assert.match(nav, /href="\/auth\/login"/);
  assert.match(footer, /Product resources/);
  assert.match(footer, /href="\/security"/);
  assert.doesNotMatch(landing, /<nav class="nav" id="nav"/, 'landing must not retain an independent navigation');
  assert.doesNotMatch(secondary, /<footer class="site-footer"/, 'secondary pages must not retain a separate footer');
});

test('every public product, company and support page renders useful SEO content and accessible real navigation', () => {
  const template = get('src/views/public/seoPage.ejs');
  const names = Object.keys(PUBLIC_PAGES);
  assert.ok(names.length >= 10);
  for (const key of names) {
    const page = PUBLIC_PAGES[key];
    assert.ok(page.title && page.heading && page.description && page.intro, key);
    assert.ok(page.sections.length >= 4, key);
    assert.ok(page.faqs.length >= 2, key);
    assert.ok(page.related.length >= 3, key);
    assert.ok((page.title + ' | AutoBrand AI').length <= 65, 'title length: ' + key);
    assert.ok(page.description.length >= 100 && page.description.length <= 190, 'description length: ' + key);

    const html = ejs.render(template, {
      page, pageKey: key, notice: '', csrfToken: 'unit-test-csrf',
      cspNonce: 'unit-test-nonce', structuredData: [],
      seo: {
        title: page.title + ' | AutoBrand AI',
        description: page.description,
        robots: 'index,follow',
        canonical: 'https://autobrand.classictechgroup.com/' + key,
        image: 'https://autobrand.classictechgroup.com/assets/autobrand-og.png'
      }
    }, { filename: secondaryPath });

    assert.equal((html.match(/class="nav" id="nav"/g) || []).length, 1, key);
    assert.equal((html.match(/<footer>/g) || []).length, 1, key);
    assert.match(html, /href="\/css\/landing.css"/, key);
    assert.match(html, /href="\/css\/public-site.css"/, key);
    assert.match(html, /href="\/js\/marketing-pages.js"/, key);
    assert.match(html, /rel="canonical"/, key);
    assert.match(html, /name="description"/, key);
    assert.match(html, /<h1 id="page-heading">/, key);
    assert.match(html, /class="info-faq"/, key);
    assert.match(html, /class="info-related-card"/, key);
    assert.doesNotMatch(html, /Autobarand|AutoBarand/i, key);
    assert.ok((html.match(/class="info-card"/g) || []).length >= 4, key);
    if (page.steps?.length) assert.match(html, /class="info-steps"/, key);
    if (key === 'contact') {
      assert.match(html, /method="post" action="\/contact"/);
      assert.match(html, /name="_csrf" value="unit-test-csrf"/);
      assert.match(html, /name="teamType"/);
      assert.match(html, /name="message"/);
    } else {
      assert.doesNotMatch(html, /method="post" action="\/contact"/, key);
    }
  }
});

test('mobile links and resources CTA cannot collapse into 36px icon squares', () => {
  const css = get('public/css/landing.css');
  assert.match(css, /\.footer-bottom \.social-links a\s*{\s*width:\s*auto;/);
  assert.match(css, /\.footer-newsletter \.btn\s*{[\s\S]*?white-space:\s*normal/);
  const js = get('public/js/marketing-pages.js');
  assert.match(js, /aria-expanded/);
  assert.match(js, /Escape/);
  assert.match(js, /setMenu/);
  assert.match(get('public/css/public-site.css'), /@media\s*\(max-width:\s*680px\)/);
});

test('meta content is product-led and does not fabricate rankings or guaranteed results', () => {
  const svc = get('src/services/publicSite.service.js');
  assert.match(svc, /const PUBLIC_PAGE_GUIDES/);
  assert.match(svc, /const PUBLIC_PAGE_RELATED/);
  assert.match(svc, /'AutoBrand AI'/);
  assert.doesNotMatch(svc, /100% guaranteed growth|number one social media platform/i);
  const controller = get('src/controllers/publicController.js');
  assert.match(controller, /BreadcrumbList/);
  assert.match(controller, /FAQPage/);
  assert.match(controller, /page\.faqs\.map/);
  assert.match(controller, /structuredData:pageSchemas\.map\(scriptJson\)/);
});

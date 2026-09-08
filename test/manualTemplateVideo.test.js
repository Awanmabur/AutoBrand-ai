const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildRenderInput, validateRenderInput } = require('../src/services/templateVideoService');

const root = path.join(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('manual template video validates user copy without invoking AI', () => {
  const clean = validateRenderInput({
    headline: 'Weekend offer', offer: 'Save 20% on selected items', cta: 'Shop now', website: 'https://example.com', aspectRatio: '9:16'
  });
  assert.equal(clean.headline, 'Weekend offer');
  assert.equal(clean.website, 'https://example.com');
  assert.throws(() => validateRenderInput({ headline: 'x', offer: 'y', website: 'javascript:alert(1)' }), /HTTP or HTTPS/);

  const renderInput = buildRenderInput({
    brand: { name: 'Classic', preferredCta: 'Call us', brandColors: ['#111111'] },
    template: { aspectRatio: '9:16', scenes: [{ name: 'Hook', layout: 'bold', durationSeconds: 4, requiredFields: ['headline'] }] },
    body: { headline: 'Exact user copy', offer: 'Exact user offer', cta: 'Exact CTA', aspectRatio: '9:16' }
  });
  assert.equal(renderInput.headline, 'Exact user copy');
  assert.equal(renderInput.offer, 'Exact user offer');
  assert.equal(renderInput.cta, 'Exact CTA');
});

test('Manual Publisher has a real local template form and startup seeds templates', () => {
  const view = source('src/views/dashboard/experience.ejs');
  const server = source('server.js');
  const controller = source('src/controllers/templateController.js');
  const local = source('src/services/localVideoService.js');
  assert.match(view, /action="\/dashboard\/actions\/templates\/render"/);
  assert.match(view, /0 AI credits/);
  assert.match(view, /name="headline"/);
  assert.match(view, /name="template"/);
  assert.match(server, /await ensureDefaultTemplates\(\)/);
  assert.match(controller, /costCredits:\s*0/);
  assert.doesNotMatch(local, /openai|replicate/i);
});

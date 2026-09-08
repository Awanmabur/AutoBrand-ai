const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('auth forms advertise the same 12-character password minimum as the server', () => {
  assert.match(source('src/views/auth/register.ejs'), /minlength="12"/);
  assert.match(source('src/views/auth/reset.ejs'), /minlength="12"/);
  assert.doesNotMatch(source('src/views/auth/register.ejs'), /minlength="8"/);
  assert.doesNotMatch(source('src/views/auth/reset.ejs'), /minlength="8"/);
});

test('queued AI posts do not persist invented placeholder content', () => {
  const composer = source('src/modules/composer/post.controller.js');
  assert.match(composer, /const queuedCaption = String\(req\.body\.caption \|\| ''\)\.trim\(\)/);
  assert.doesNotMatch(composer, /AI generation is preparing this/);
  assert.match(source('src/models/Post.js'), /caption: \{ type: String, default: '', trim: true \}/);
});

test('production generated media cannot silently fall back to ephemeral local disk', () => {
  const persistence = source('src/services/generatedMediaPersistence.service.js');
  const validation = source('src/config/validateEnv.js');
  assert.match(persistence, /GENERATED_MEDIA_STORAGE=local is not allowed in production/);
  assert.match(persistence, /could not be persisted to durable storage/);
  assert.match(validation, /GENERATED_MEDIA_STORAGE=local is not allowed in production/);
  assert.doesNotMatch(source('src/services/localVideoService.js'), /falling back to local disk/);
  assert.doesNotMatch(source('src/services/mediaTransformService.js'), /falling back to local disk/);
  assert.doesNotMatch(source('src/services/ai/legacyProvider.service.js'), /using local disk fallback|falling back to local disk/);
});

test('WhatsApp copy is a handoff artifact, not an advertised direct-publishing destination', () => {
  const destinations = source('src/services/social/socialDestination.service.js');
  const socialUi = source('src/modules/social-accounts/social.controller.js');
  const dashboard = source('src/modules/dashboard/dashboard.controller.js');
  const payload = source('src/services/composer/composerPayloadValidation.service.js');
  assert.doesNotMatch(destinations, /\{ key: 'whatsapp'/);
  assert.doesNotMatch(socialUi, /\{ key: 'whatsapp'/);
  assert.match(dashboard, /WhatsApp handoff copy \(not direct publishing\)/);
  assert.doesNotMatch(payload, /whatsapp_message/);
});

test('unsupported publishing and analytics paths are explicit unavailable states, not fake implementations', () => {
  const publishing = source('src/services/publishingService.js');
  const analytics = source('src/services/analytics/providerMetrics.service.js');
  assert.match(publishing, /Unsupported publishing destination/);
  assert.doesNotMatch(publishing, /Direct publishing is not implemented/);
  assert.match(analytics, /Per-post analytics are unavailable/);
  assert.doesNotMatch(analytics, /analytics are not implemented/);
});

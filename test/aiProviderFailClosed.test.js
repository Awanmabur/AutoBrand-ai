const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getProvider, supportedProviders } = require('../src/services/ai/aiProvider.factory');
const { DEFAULT_MODEL_REGISTRY } = require('../src/services/ai/aiModelRegistry.service');
const { DEFAULT_PLAN_MATRIX } = require('../src/services/subscription/defaultPlans');
const { buildAiConfig, AI_PROVIDER_OPTIONS } = require('../src/services/admin/planForm.service');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('local deterministic output is not registered as a generative AI provider', () => {
  assert.equal(supportedProviders().includes('local'), false);
  assert.equal(Object.hasOwn(DEFAULT_MODEL_REGISTRY, 'local'), false);
  assert.equal(AI_PROVIDER_OPTIONS.includes('local'), false);
  assert.equal(fs.existsSync(path.join(root, 'src/services/ai/providers/local.provider.js')), false);
  assert.throws(() => getProvider('local'), /Unsupported AI provider: local/);
});

test('default plans never expose local as an AI provider, model, or fallback', () => {
  for (const plan of DEFAULT_PLAN_MATRIX) {
    const ai = plan.aiConfig || {};
    assert.equal((ai.allowedProviders || []).includes('local'), false, `${plan.slug} allows local`);
    for (const value of [
      ...(ai.allowedModels || []),
      ai.defaultTextProvider,
      ai.defaultTextModel,
      ai.defaultImageProvider,
      ai.defaultImageModel,
      ai.defaultVideoProvider,
      ai.defaultVideoModel,
      ai.fallbackProvider,
      ai.fallbackModel
    ].filter(Boolean)) {
      assert.doesNotMatch(String(value), /^local(?:-|$)/, `${plan.slug} contains legacy local AI routing`);
    }
  }
});

test('admin plan parsing rejects manually submitted local AI provider values', () => {
  assert.throws(() => buildAiConfig({ aiConfig: { allowedProviders: ['local'] } }), /Unsupported AI provider: local/);
  assert.throws(() => buildAiConfig({ aiConfig: { allowedProviders: ['openai'], fallbackProvider: 'local' } }), /Unsupported AI provider: local/);
});

test('AI UI and routing source contain no local provider option or implicit local default', () => {
  for (const file of [
    'public/js/dashboard-experience.js',
    'src/views/dashboard/experience.ejs',
    'src/services/ai/aiTaskRouter.js',
    'src/models/PlanAiConfig.js',
    'src/models/SubscriptionPlan.js'
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /local-fast|local-fallback|local-image|local-storyboard|Local deterministic fallback/);
  }
});

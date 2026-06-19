const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAvatarScenePlan,
  buildAvatarScript,
  enrichAvatarVideoJob,
  mockAvatarVideoResult
} = require('../src/services/avatarVideoWorkflow.service');

test('avatar workflow builds default scripts and consent-safe scenes', () => {
  const avatar = { _id: 'avatar-1', name: 'Awan', consentVersion: '2026-05-16', allowedUse: 'brand_content' };
  const brand = { name: 'Kampala Coffee', description: 'Fresh coffee.', preferredCta: 'Order today.' };
  const script = buildAvatarScript({ avatar, brand });
  const scenes = buildAvatarScenePlan({ avatar, brand, script, durationSeconds: 20 });

  assert.match(script, /Awan/);
  assert.equal(scenes[0].durationSeconds, 20);
  assert.match(scenes[0].visualPrompt, /AI-generated disclosure/);
});

test('avatar workflow enriches mock avatar jobs', () => {
  const avatar = { _id: 'avatar-1', name: 'Awan', consentVersion: '2026-05-16', allowedUse: 'brand_content' };
  const brand = { name: 'Kampala Coffee' };
  const job = {
    _id: 'job-1',
    mode: 'avatar_video',
    prompt: 'Avatar promo',
    scenePlan: buildAvatarScenePlan({ avatar, brand, script: 'Hi', durationSeconds: 10 }),
    metadata: {}
  };

  enrichAvatarVideoJob(job, { avatar, brand });
  const result = mockAvatarVideoResult({ job, avatar, brand });

  assert.equal(job.metadata.avatar.mockProvider, true);
  assert.ok(job.subtitles.length);
  assert.equal(result.provider, 'mock_avatar_provider');
});

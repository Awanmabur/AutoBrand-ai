const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSubtitles,
  buildThumbnailPrompt,
  buildVideoScript,
  enrichVideoJob
} = require('../src/services/videoWorkflow.service');

const scenePlan = [
  { order: 1, title: 'Hook', narration: 'Need better coffee?', visualPrompt: 'Opening cup shot', durationSeconds: 3 },
  { order: 2, title: 'Offer', narration: 'Try the lunch combo.', visualPrompt: 'Food and drink', durationSeconds: 5 }
];

test('video workflow creates script, subtitles and thumbnail prompts from scenes', () => {
  const script = buildVideoScript(scenePlan);
  const subtitles = buildSubtitles(scenePlan);
  const thumbnail = buildThumbnailPrompt({ brand: { name: 'Kampala Coffee', brandColors: ['#111111'] }, job: { mode: 'brand_to_video', prompt: 'Promo' }, scenePlan });

  assert.match(script, /Scene 1/);
  assert.deepEqual(subtitles.map((item) => [item.startSeconds, item.endSeconds]), [[0, 3], [3, 8]]);
  assert.match(thumbnail, /Kampala Coffee/);
});

test('video workflow enriches jobs without manufacturing provider output', () => {
  const job = { _id: 'job-1', mode: 'brand_to_video', prompt: 'Promo', scenePlan, metadata: {} };
  enrichVideoJob(job, { brand: { name: 'Kampala Coffee' } });

  assert.ok(job.script);
  assert.equal(job.subtitles.length, 2);
  assert.equal(job.metadata.workflow.provider, undefined);
  assert.equal('mock' in job.metadata.workflow, false);
});

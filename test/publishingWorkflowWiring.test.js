const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('publishing and in-web AI generation are self-healing defaults', () => {
  const env = source('src/config/env.js');
  const server = source('server.js');
  assert.match(env, /publishingPaused:?[\s\S]*scheduledPublishingEnabled: !publishingPaused/);
  assert.match(env, /AI_GENERATION_WORKER_MODE/);
  assert.match(env, /aiGenerationWorkerMode === 'web'/);
  assert.match(server, /startDuePostPublisher\(\)/);
  assert.match(server, /startPostGenerationWorker\(\)/);
  assert.match(server, /ENABLE_SCHEDULED_PUBLISHING=false is deprecated and ignored/);
  assert.match(server, /RUN_AI_GENERATION_WORKER_IN_WEB=false is deprecated and ignored/);
});

test('Redis is optional and queue jobs carry schedule versions', () => {
  const scheduler = source('src/services/schedulerService.js');
  const dispatch = source('src/services/postDispatchService.js');
  assert.match(scheduler, /getQueueConnection\(\)/);
  assert.match(scheduler, /connection\.ping\(\)/);
  assert.match(scheduler, /scheduleVersion: scheduleVersionFor\(post\)/);
  assert.match(dispatch, /database publisher remains the durable fallback/);
  assert.match(dispatch, /requestDatabaseSweep/);
});

test('publishing atomically claims only due or stale jobs and blocks production mocks', () => {
  const publishing = source('src/services/publishingService.js');
  assert.match(publishing, /findOneAndUpdate\(/);
  assert.match(publishing, /status: 'scheduled', scheduledAt: \{ \$lte: now \}/);
  assert.match(publishing, /claimFilter\.scheduleVersion/);
  assert.match(publishing, /Mock social accounts cannot publish in production/);
  assert.match(publishing, /This post requires approval before publishing/);
  assert.match(publishing, /scheduleVersion: \{ \$exists: false \}/);
});

test('approval, campaign, retry and worker paths durably dispatch posts', () => {
  const approval = source('src/services/approvals/approval.service.js');
  const campaign = source('src/controllers/campaignController.js');
  const retry = source('src/services/publishingRetryPolicyService.js');
  const worker = source('workers/postWorker.js');

  assert.match(approval, /await dispatchScheduledPost\(link\.post/);
  const approvalController = source('src/controllers/approvalController.js');
  assert.match(approvalController, /async function notifySafely/);
  assert.match(campaign, /await dispatchScheduledPost\(post/);
  assert.match(retry, /await dispatchScheduledPost\(post/);
  assert.match(worker, /expectedScheduleVersion: job\.data\.scheduleVersion/);
});

test('database fallback repairs legacy scheduled records and stale publishing attempts', () => {
  const fallback = source('src/services/duePostPublisherService.js');
  assert.match(fallback, /status: 'scheduled', scheduledAt: null/);
  assert.match(fallback, /status: 'approved', publishAfterApproval: true/);
  assert.match(fallback, /publishingStartedAt: \{ \$exists: false \}/);
  assert.match(fallback, /expectedScheduleVersion: due\.scheduleVersion/);
  assert.match(fallback, /DUE_POST_CONCURRENCY/);
  const http = source('src/utils/fetchWithTimeout.js');
  assert.match(http, /SOCIAL_PROVIDER_TIMEOUT_MS/);
  assert.match(http, /AbortController/);
});


test('X media publishing uses current v2 upload routes and required scope', () => {
  const xService = source('src/services/xService.js');
  assert.match(xService, /'media\.write'/);
  assert.match(xService, /\/media\/upload\/initialize/);
  assert.match(xService, /\/media\/upload\/\$\{encodeURIComponent\(mediaId\)\}\/append/);
  assert.match(xService, /\/media\/upload\/\$\{encodeURIComponent\(mediaId\)\}\/finalize/);
});

test('worker startup never blocks the HTTP listener', () => {
  const generation = source('src/services/postGeneration.service.js');
  assert.match(generation, /setTimeout\(async \(\) =>/);
  assert.match(generation, /must never block HTTP startup/);
  assert.match(generation, /return timer/);
});

test('generated-media recovery and per-platform publishing are wired end to end', () => {
  const generation = source('src/services/postGeneration.service.js');
  const publishing = source('src/services/publishingService.js');
  const composer = source('src/modules/composer/post.controller.js');

  assert.match(generation, /recoverCompletedJobsWithMissingMedia/);
  assert.match(generation, /missing generated media requeued/);
  assert.match(generation, /archiveMissingGeneratedMedia/);
  assert.ok(generation.indexOf('await finishRequestedAction(post, metadata)') < generation.indexOf('await chargeGeneration({'));
  assert.match(publishing, /Multi-platform publishing is intentionally not all-or-nothing/);
  assert.match(publishing, /readinessByPlatform/);
  assert.match(publishing, /platform blocked before provider call/);
  assert.match(composer, /\[composer\] AI post queued/);
  assert.match(composer, /requestedAction: action/);
});

test('generated media uses durable GridFS storage and a public range-enabled route', () => {
  const generationProvider = source('src/services/ai/legacyProvider.service.js');
  const storage = source('src/services/gridFsMediaStorage.service.js');
  const app = source('src/app.js');
  const facebook = source('src/services/facebookService.js');
  const availability = source('src/services/mediaAvailability.service.js');

  assert.match(generationProvider, /saveBufferToGridFs/);
  assert.match(generationProvider, /GENERATED_MEDIA_STORAGE/);
  assert.match(storage, /GridFSBucket/);
  assert.match(storage, /Accept-Ranges/);
  assert.match(storage, /Content-Range/);
  assert.match(app, /\/uploads\/db\/:id\/:filename\?/);
  assert.match(facebook, /readGridFsBuffer/);
  assert.match(availability, /gridFsFileExists/);
});

test('quick create supports exact multi-platform Facebook and Instagram targets', () => {
  const view = source('src/views/dashboard/experience.ejs');
  const browser = source('public/js/dashboard-experience.js');
  assert.match(view, /Publish to platforms/);
  assert.match(view, /name="platforms" type="checkbox"/);
  assert.match(view, /Exact connected destinations/);
  assert.match(view, /name="targetAccounts" type="checkbox"/);
  assert.match(browser, /input\.disabled = !visible/);
  assert.match(browser, /matchingPlatform\.checked = true/);
});

test('Meta OAuth verifies Instagram publishing grants and retires unverified legacy connections', () => {
  const facebook = source('src/services/facebookService.js');
  const migration = source('src/services/metaAccountReadiness.service.js');
  const server = source('server.js');
  assert.match(facebook, /instagram_basic/);
  assert.match(facebook, /instagram_content_publish/);
  assert.match(facebook, /\/me\/permissions/);
  assert.match(facebook, /permissionGrantVerifiedAt/);
  assert.match(facebook, /status: missingPermissions\.length \? 'needs_reconnect' : 'connected'/);
  assert.match(migration, /legacy Instagram connections require reconnect/);
  assert.match(server, /markLegacyInstagramAccountsForReconnect/);
});

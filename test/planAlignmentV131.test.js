const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_PLAN_MATRIX } = require('../src/services/subscription/defaultPlans');

function source(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function plan(slug) {
  return DEFAULT_PLAN_MATRIX.find((item) => item.slug === slug);
}

test('Publish is BYO-AI infrastructure while AI Brain Autopilot starts on Growth', () => {
  const publish = plan('manual-publisher');
  const starter = plan('starter');
  const growth = plan('growth');
  const superadmin = plan('superadmin');
  assert.equal(publish.limits.maxAiTextGenerations, 0);
  assert.equal(publish.limits.maxAiImageGenerations, 0);
  assert.equal(publish.features.autoModeAccess, false);
  assert.equal(starter.features.autoModeAccess || false, false);
  assert.equal(growth.features.autoModeAccess, true);
  assert.ok(growth.limits.maxAutoPosts > 0);
  assert.equal(superadmin.limits.maxAutoPosts, -1);
  assert.equal(superadmin.includedCredits, -1);
});

test('core connectors remain opt-in plan features even though built-in plans include them', () => {
  const featureAccess = source('src/services/subscription/featureAccess.service.js');
  const planModel = source('src/models/SubscriptionPlan.js');
  for (const feature of ['chatgptConnectorAccess', 'googleDriveAccess', 'channelWorkspacesAccess']) {
    assert.match(featureAccess, new RegExp(`${feature}: false`));
    assert.match(planModel, new RegExp(`${feature}: \\{ type: Boolean, default: false \\}`));
    for (const item of DEFAULT_PLAN_MATRIX) assert.equal(item.features[feature], true);
  }
});

test('manual dashboard uploads honor the users storage preference and Drive connection', () => {
  const controller = source('src/controllers/mediaController.js');
  assert.match(controller, /req\.user\.assetStoragePreference/);
  assert.match(controller, /createDriveOnlyMedia/);
  assert.match(controller, /mirrorMediaToDrive/);
  assert.match(controller, /Google Drive asset storage/);
});

test('Google Drive storage is scoped to the connected user, not a platform owner Drive', () => {
  const drive = source('src/services/storage/googleDrive.service.js');
  const envConfig = source('src/config/env.js');
  assert.match(drive, /CloudStorageConnection\.findOne\(\{ owner: userId, provider: 'google_drive' \}\)/);
  assert.match(drive, /\{ owner: user\._id, provider: 'google_drive' \}/);
  assert.match(drive, /scope: env\.googleDriveScopes/);
  assert.match(envConfig, /https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  assert.doesNotMatch(drive, /SUPERADMIN.*drive/i);
});

test('Brand Brain UI exposes manual, ChatGPT, AutoBrand AI and hybrid operating sources', () => {
  const createForm = source('src/views/dashboard/partials/brand-quick-form.ejs');
  const dashboardJs = source('public/js/dashboard-experience.js');
  for (const token of ['aiBrainEnabled', 'manual_assets', 'chatgpt_operator', 'autobrand_ai', 'hybrid', 'autopilot']) {
    assert.match(createForm, new RegExp(token));
    assert.match(dashboardJs, new RegExp(token));
  }
  assert.doesNotMatch(createForm, /name="autoPostingEnabled"/);
});

test('AI Brain background worker is plan-gated, analytics-aware and fail-safe', () => {
  const brain = source('src/services/aiBrain/aiBrainProcessor.service.js');
  assert.match(brain, /assertPlanPageAccess/);
  assert.match(brain, /assertPlanFeature\(user, 'autoModeAccess'/);
  assert.match(brain, /updateBrandPerformanceMemory/);
  assert.match(brain, /minContentScore/);
  assert.match(brain, /pending_approval/);
  assert.match(brain, /dispatchScheduledPost/);
});

test('legacy auto campaign AI usage is metered and Handoff waits for approval', () => {
  const autoCampaign = source('src/services/autoCampaignService.js');
  const composer = source('src/modules/composer/post.controller.js');
  assert.match(autoCampaign, /assertCanGenerateText/);
  assert.match(autoCampaign, /assertCanGenerateImage/);
  assert.match(autoCampaign, /assertCanCreateVideo/);
  assert.match(autoCampaign, /spendCredits/);
  assert.match(autoCampaign, /ai_generate_video/);
  assert.match(composer, /workflowMode: 'handoff',[\s\S]*status: 'pending_approval'/);
});

test('ChatGPT can inspect, configure and run AI Brain through AutoBrand MCP', () => {
  const defs = source('src/services/mcp/mcpToolDefinitions.js');
  const handlers = source('src/controllers/mcp/mcp.controller.js');
  for (const tool of ['get_ai_brain', 'update_ai_brain', 'run_ai_brain_now']) {
    assert.match(defs, new RegExp(tool));
    assert.match(handlers, new RegExp(tool));
  }
});

test('core integrations are explicit per built-in plan and pricing reflects false custom entitlements', () => {
  const plansSource = source('src/services/subscription/defaultPlans.js');
  const display = source('src/services/planDisplay.service.js');
  assert.match(plansSource, /CORE_INTEGRATION_ENTITLEMENTS/);
  for (const slug of ['free-trial','manual-publisher','starter','growth','pro','business','agency','superadmin']) {
    assert.match(plansSource, new RegExp(`['\"]?${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]?\\s*:`));
  }
  assert.match(display, /yesNo\(Boolean\(features\.chatgptConnectorAccess\)\)/);
  assert.match(display, /yesNo\(Boolean\(features\.googleDriveAccess\)\)/);
  assert.match(display, /yesNo\(Boolean\(features\.channelWorkspacesAccess\)\)/);
});

test('unattended AutoBrand AI Brain approval and autopilot both require Growth+ automation', () => {
  const settings = source('src/services/aiBrain/aiBrainSettings.service.js');
  const processor = source('src/services/aiBrain/aiBrainProcessor.service.js');
  assert.match(settings, /AI Brain background automation/);
  assert.match(settings, /\['autobrand_ai', 'hybrid'\]\.includes\(brain\.contentSource\)/);
  assert.match(processor, /await assertPlanFeature\(user, 'autoModeAccess'/);

  const starter = plan('starter');
  const growth = plan('growth');
  assert.equal(Boolean(starter.features.autoModeAccess), false);
  assert.equal(Boolean(growth.features.autoModeAccess), true);
});

test('Brand Brain controls visibly mirror AI and automation plan entitlements', () => {
  const form = source('src/views/dashboard/partials/brand-quick-form.ejs');
  const js = source('public/js/dashboard-experience.js');
  for (const token of ['brainCanUseAutomation', 'brainCanUseBuiltInAi', 'brainCanUseChatGPT']) assert.match(form, new RegExp(token));
  for (const token of ['canUseAiBrainAutomation', 'canUseBuiltInAiBrain', 'canUseChatGptOperator']) assert.match(js, new RegExp(token));
  assert.match(form, /Growth\+/);
  assert.match(js, /Growth\+/);
});

test('AI plan upgrades are monotonic so higher paid tiers never lose lower-tier capabilities', () => {
  const chain = ['starter', 'growth', 'pro', 'business', 'agency'].map(plan);
  const booleanFeatures = [
    'manualPublisherAccess','calendarAccess','campaignAccess','growthStudioAccess','autoModeAccess','handoffModeAccess',
    'approvalWorkflowAccess','clientApprovalPortalAccess','contentRepurposingAccess','bulkCreateAccess','contentScoreAccess',
    'brandFitCheckerAccess','riskCheckerAccess','bestTimeSuggestionAccess','competitorWatchAccess','whiteLabelAccess',
    'prioritySupportAccess','templateAccess','failedPostRecoveryAccess','agencyWorkspaceAccess','chatgptConnectorAccess',
    'googleDriveAccess','channelWorkspacesAccess'
  ];
  const levelRank = { none: 0, basic: 1, standard: 2, advanced: 3, premium: 4, unlimited: 100 };
  const levelFeatures = ['brandBrainLevel','smartComposerLevel','analyticsLevel'];
  const numericLimits = ['maxBrands','maxSocialAccounts','maxTeamMembers','maxScheduledPosts','maxManualPosts','maxAiTextGenerations','maxAiImageGenerations','maxAiVideoGenerations','maxAvatarVideos','maxHandoffPosts','maxAutoPosts','maxClientApprovalLinks','maxStorageMb'];

  for (let i = 1; i < chain.length; i += 1) {
    const lower = chain[i - 1];
    const higher = chain[i];
    for (const feature of booleanFeatures) {
      if (Boolean(lower.features[feature])) assert.equal(Boolean(higher.features[feature]), true, `${higher.slug} lost ${feature} from ${lower.slug}`);
    }
    for (const feature of levelFeatures) {
      assert.ok((levelRank[higher.features[feature]] || 0) >= (levelRank[lower.features[feature]] || 0), `${higher.slug} downgraded ${feature}`);
    }
    for (const limit of numericLimits) {
      const low = Number(lower.limits[limit] || 0);
      const high = Number(higher.limits[limit] || 0);
      assert.ok(high < 0 || high >= low, `${higher.slug} reduced ${limit} from ${low} to ${high}`);
    }
    assert.ok(Number(higher.includedCredits) >= Number(lower.includedCredits), `${higher.slug} reduced included credits`);
  }
});

test('channel workspaces respect analytics depth while remaining available across current plans', () => {
  const controller = source('src/controllers/channelWorkspaceController.js');
  const view = source('src/views/dashboard/channel-workspace.ejs');
  assert.match(controller, /getDashboardEntitlementPlan/);
  assert.match(controller, /analyticsCapabilities/);
  assert.match(controller, /LEVEL_ORDER/);
  assert.match(view, /analyticsCapabilities\.recommendations/);
  assert.match(view, /analyticsCapabilities\.topPerformance/);
  assert.match(view, /Basic analytics/);
});

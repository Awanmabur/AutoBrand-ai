const { buildSubtitles, buildThumbnailPrompt, buildVideoScript, mockVideoResult } = require('./videoWorkflow.service');

function buildAvatarScript({ avatar = {}, brand = {}, prompt = '' } = {}) {
  if (prompt) return prompt;
  if (avatar.defaultScript) return avatar.defaultScript;
  return [
    `Hi, I am ${avatar.name || 'the brand presenter'} from ${brand.name || 'the brand'}.`,
    `${brand.description || `${brand.name || 'We'} help customers take the next step with confidence.`}`,
    `${brand.preferredCta || 'Message us today and we will help you get started.'}`
  ].filter(Boolean).join(' ');
}

function buildAvatarScenePlan({ avatar = {}, brand = {}, script = '', durationSeconds = 30 } = {}) {
  return [
    {
      order: 1,
      title: `${avatar.name || 'Avatar'} presenter`,
      visualPrompt: `Consent-protected talking avatar for ${brand.name || 'brand'}. Add visible AI-generated disclosure, clean lighting, subtitle-safe framing, and brand outro.`,
      narration: script,
      durationSeconds: Number(durationSeconds || 30),
      status: 'planned'
    }
  ];
}

function enrichAvatarVideoJob(job, { avatar = {}, brand = {} } = {}) {
  job.script = job.script || buildVideoScript(job.scenePlan || []);
  job.subtitles = job.subtitles?.length ? job.subtitles : buildSubtitles(job.scenePlan || []);
  job.thumbnailPrompt = job.thumbnailPrompt || buildThumbnailPrompt({ brand, job, scenePlan: job.scenePlan || [] });
  job.metadata = {
    ...(job.metadata || {}),
    avatar: {
      profileId: avatar._id?.toString?.() || '',
      profileName: avatar.name || '',
      consentVersion: avatar.consentVersion,
      allowedUse: avatar.allowedUse,
      mockProvider: true,
      disclosure: 'Demo avatar render. Replace with approved provider output for production publishing.',
      updatedAt: new Date()
    }
  };
  return job;
}

function mockAvatarVideoResult({ job = {}, avatar = {}, brand = {} } = {}) {
  const result = mockVideoResult({ job, brand });
  return {
    ...result,
    provider: 'mock_avatar_provider',
    providerJobId: `mock_avatar_${avatar._id?.toString?.() || job._id?.toString?.() || Date.now()}`,
    message: 'Mock avatar video render created because no real avatar provider is configured.'
  };
}

module.exports = {
  buildAvatarScenePlan,
  buildAvatarScript,
  enrichAvatarVideoJob,
  mockAvatarVideoResult
};

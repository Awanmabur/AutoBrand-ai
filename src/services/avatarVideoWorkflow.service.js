const { buildSubtitles, buildThumbnailPrompt, buildVideoScript } = require('./videoWorkflow.service');

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
      disclosure: 'AI-generated avatar media. Publish only after the stored consent and disclosure requirements are satisfied.',
      updatedAt: new Date()
    }
  };
  return job;
}


module.exports = {
  buildAvatarScenePlan,
  buildAvatarScript,
  enrichAvatarVideoJob
};

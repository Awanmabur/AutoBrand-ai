function buildVideoScript(scenePlan = []) {
  return (scenePlan || [])
    .map((scene) => `Scene ${scene.order || ''} - ${scene.title || 'Scene'}: ${scene.narration || scene.visualPrompt || ''}`.trim())
    .filter(Boolean)
    .join('\n');
}

function buildSubtitles(scenePlan = []) {
  let cursor = 0;
  return (scenePlan || []).map((scene) => {
    const duration = Math.max(1, Number(scene.durationSeconds || 4));
    const subtitle = {
      startSeconds: cursor,
      endSeconds: cursor + duration,
      text: scene.narration || scene.title || ''
    };
    cursor += duration;
    return subtitle;
  }).filter((subtitle) => subtitle.text);
}

function buildThumbnailPrompt({ brand = {}, job = {}, scenePlan = [] } = {}) {
  const firstScene = scenePlan[0] || {};
  return [
    `Thumbnail for ${brand.name || 'brand'} ${job.mode || 'video'}.`,
    firstScene.visualPrompt || firstScene.title || job.prompt,
    `Use ${brand.brandColors?.join(', ') || 'brand colors'}, clear product or service focus, no tiny text, strong CTA-safe composition.`
  ].filter(Boolean).join(' ');
}


function enrichVideoJob(job, { brand = {}, providerResult = null } = {}) {
  const scenePlan = job.scenePlan || [];
  job.script = job.script || buildVideoScript(scenePlan);
  job.subtitles = job.subtitles?.length ? job.subtitles : buildSubtitles(scenePlan);
  job.thumbnailPrompt = job.thumbnailPrompt || buildThumbnailPrompt({ brand, job, scenePlan });
  job.metadata = {
    ...(job.metadata || {}),
    workflow: {
      scriptGenerated: Boolean(job.script),
      subtitlesGenerated: Boolean(job.subtitles?.length),
      thumbnailPromptGenerated: Boolean(job.thumbnailPrompt),
      provider: providerResult?.provider || job.provider,
      updatedAt: new Date()
    }
  };
  return job;
}

module.exports = {
  buildSubtitles,
  buildThumbnailPrompt,
  buildVideoScript,
  enrichVideoJob
};

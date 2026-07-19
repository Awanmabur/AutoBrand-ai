function tags(media) {
  return Array.isArray(media.tags) ? media.tags.filter(Boolean) : [];
}

function mediaLabel(media) {
  const tagText = tags(media).length ? ` tagged ${tags(media).join(', ')}` : '';
  return `${media.fileType || 'asset'} "${media.fileName}"${tagText}`;
}

function buildMediaInsights(media, brand) {
  const label = mediaLabel(media);
  const audience = brand.targetAudience || 'local customers';
  const cta = brand.preferredCta || 'contact us today';
  const tone = brand.tone || 'clean and friendly';
  const platforms = media.fileType === 'video'
    ? ['tiktok', 'instagram', 'youtube', 'facebook']
    : ['instagram', 'facebook', 'pinterest', 'linkedin'];

  return {
    summary: `Use ${label} as reusable brand evidence for ${brand.name}.`,
    visualPrompt: `Create ${tone} social content for ${brand.name} using ${label}. Keep the asset recognizable, leave space for headline and CTA, and aim it at ${audience}.`,
    contentAngles: [
      `Show ${label} as proof of the offer.`,
      `Explain the customer problem: ${brand.customerPainPoints?.[0] || 'save time and reduce uncertainty'}.`,
      `Turn the asset into a simple before/after or product benefit story.`,
      `Turn the asset into a direct promo with a clear CTA: ${cta}.`
    ],
    recommendedPlatforms: platforms,
    safetyNotes: media.consentRequired
      ? [`Consent status is ${media.consentStatus}. Do not use for avatar/clone workflows until consent is accepted.`]
      : ['No additional consent requirement is marked on this asset.'],
    reuseInstructions: [
      'Attach this media to generated drafts when the topic matches the asset.',
      'Use this media as a keyframe or visual reference in video scenes.',
      'Generate square, vertical, and landscape variants before publishing across platforms.'
    ],
    generatedFrom: 'metadata',
    generatedAt: new Date()
  };
}

function mediaContext(media) {
  if (!media) return '';
  const insights = media.aiInsights || {};
  return [
    `Source media: ${media.fileName}`,
    `Type: ${media.fileType}`,
    `Tags: ${tags(media).join(', ') || 'none'}`,
    `URL: ${media.fileUrl}`,
    insights.summary ? `Summary: ${insights.summary}` : '',
    media.aiPrompt ? `Saved AI prompt: ${media.aiPrompt}` : '',
    insights.visualPrompt ? `Visual prompt: ${insights.visualPrompt}` : '',
    insights.contentAngles?.length ? `Content angles: ${insights.contentAngles.join('; ')}` : '',
    insights.safetyNotes?.length ? `Safety notes: ${insights.safetyNotes.join('; ')}` : ''
  ].filter(Boolean).join('\n');
}

function applyMediaToScenes(scenes, mediaItems) {
  if (!mediaItems.length) return scenes;
  const context = mediaItems.map((item) => item.aiInsights?.visualPrompt || mediaContext(item)).join(' ');
  return scenes.map((scene, index) => ({
    ...scene,
    visualPrompt: `${scene.visualPrompt} Use uploaded asset reference ${index + 1 <= mediaItems.length ? mediaItems[index].fileName : mediaItems[0].fileName}. ${context}`,
    status: scene.status || 'planned'
  }));
}

module.exports = { applyMediaToScenes, buildMediaInsights, mediaContext };

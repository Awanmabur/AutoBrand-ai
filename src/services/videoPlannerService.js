function planAutomaticVideoScenes({ brand, goal, offer, platform, style }) {
  const target = brand.targetAudience || 'local customers';
  const tone = brand.tone || 'clean and friendly';
  const cta = brand.preferredCta || 'Contact us today';

  return [
    {
      order: 1,
      title: 'Hook',
      visualPrompt: `Clean ${style || 'modern'} opening shot for ${brand.name}, aimed at ${target}, optimized for ${platform || 'social media'}.`,
      narration: `${brand.name} helps ${target} with ${goal || brand.businessType || 'better service'}.`,
      durationSeconds: 4
    },
    {
      order: 2,
      title: 'Offer',
      visualPrompt: `AI-generated product or service scene showing ${offer || 'the main offer'} with brand colors and local business feel.`,
      narration: offer || brand.description || 'A simple offer made for your audience.',
      durationSeconds: 6
    },
    {
      order: 3,
      title: 'Call to action',
      visualPrompt: `Branded outro with logo space, confident ${tone} mood, clear CTA text, and clean motion graphics.`,
      narration: cta,
      durationSeconds: 5
    }
  ];
}

module.exports = { planAutomaticVideoScenes };

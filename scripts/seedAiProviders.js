const connectDb = require('../src/config/db');
const AiProviderConfig = require('../src/models/AiProviderConfig');
const { DEFAULT_MODEL_REGISTRY } = require('../src/services/ai/aiModelRegistry.service');

const TASKS = [
  'text_generation', 'caption_generation', 'hashtag_generation', 'campaign_generation', 'content_calendar_generation',
  'brand_voice_generation', 'post_rewrite', 'reply_generation', 'ad_copy_generation', 'image_generation', 'image_editing',
  'video_generation', 'avatar_video_generation', 'script_generation', 'analytics_summary', 'best_time_prediction',
  'platform_variation_generation', 'content_score', 'brand_fit_check', 'risk_check'
];

async function main() {
  await connectDb();
  let priority = 10;
  for (const [slug, models] of Object.entries(DEFAULT_MODEL_REGISTRY)) {
    await AiProviderConfig.findOneAndUpdate(
      { slug },
      {
        name: slug.replace(/(^|[-_])\w/g, (match) => match.toUpperCase()).replace(/[-_]/g, ' '),
        slug,
        taskTypes: TASKS.filter((task) => {
          if (task.includes('image')) return Boolean(models.image);
          if (task.includes('video')) return Boolean(models.video);
          return Boolean(models.text);
        }),
        defaultModel: models.text?.[0] || models.image?.[0] || models.video?.[0] || '',
        textModel: models.text?.[0] || '',
        imageModel: models.image?.[0] || '',
        videoModel: models.video?.[0] || '',
        isActive: true,
        isFallback: slug === 'local',
        priority: priority++,
        metadata: { models }
      },
      { upsert: true, new: true }
    );
  }
  console.log(`Seeded ${Object.keys(DEFAULT_MODEL_REGISTRY).length} AI provider configs.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

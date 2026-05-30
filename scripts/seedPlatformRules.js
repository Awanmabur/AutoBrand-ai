const connectDb = require('../src/config/db');
const PlatformContentRule = require('../src/models/PlatformContentRule');
const { DEFAULT_PLATFORM_RULES } = require('../src/services/composer/defaultPlatformRules');

async function main() {
  await connectDb();
  for (const [platform, rule] of Object.entries(DEFAULT_PLATFORM_RULES)) {
    await PlatformContentRule.findOneAndUpdate({ platform }, { platform, ...rule, isActive: true }, { upsert: true, new: true });
  }
  console.log(`Seeded ${Object.keys(DEFAULT_PLATFORM_RULES).length} platform content rules.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

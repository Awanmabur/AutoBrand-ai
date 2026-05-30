const connectDb = require('../src/config/db');
const { seedDefaultPlans } = require('../src/services/subscription.service');

async function main() {
  await connectDb();
  const plans = await seedDefaultPlans({ overwrite: process.argv.includes('--overwrite') });
  console.log(`Seeded ${plans.length} subscription plans.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

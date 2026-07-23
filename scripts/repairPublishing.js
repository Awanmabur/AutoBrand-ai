const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const { validateEnvironment } = require('../src/config/validateEnv');
const {
  recoverCompletedGenerationActions,
  recoverCompletedJobsWithMissingMedia
} = require('../src/services/postGeneration.service');
const { publishDueScheduledPosts } = require('../src/services/duePostPublisherService');
const { markLegacyInstagramAccountsForReconnect } = require('../src/services/metaAccountReadiness.service');
const { markUndecryptableSocialAccountsForReconnect } = require('../src/services/socialCredentialReadiness.service');

async function main() {
  validateEnvironment();
  await connectDb();
  const metaConnections = await markLegacyInstagramAccountsForReconnect();
  const credentialConnections = await markUndecryptableSocialAccountsForReconnect();
  const mediaRecovery = await recoverCompletedJobsWithMissingMedia({ limit: 200 });
  const actionRecovery = await recoverCompletedGenerationActions({ limit: 200 });
  const publishing = await publishDueScheduledPosts({ limit: 100 });
  console.log(JSON.stringify({
    ok: true,
    metaConnections: { matched: metaConnections.matchedCount || 0, modified: metaConnections.modifiedCount || 0 },
    credentialConnections,
    mediaRecovery,
    actionRecovery,
    publishing,
    nextStep: mediaRecovery.requeued
      ? 'Restart the normal web service so its AI generation worker regenerates requeued media.'
      : 'No missing generated-media jobs required regeneration.'
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });

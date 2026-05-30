const connectDb = require('../src/config/db');
const AdminRole = require('../src/models/AdminRole');

const PERMISSIONS = [
  'users.view', 'users.create', 'users.edit', 'users.suspend', 'users.delete',
  'plans.view', 'plans.create', 'plans.edit', 'plans.delete',
  'billing.view', 'billing.manage',
  'ai.view', 'ai.edit',
  'content.view', 'content.moderate',
  'analytics.view',
  'settings.view', 'settings.edit',
  'integrations.view', 'integrations.edit',
  'security.view', 'audit.view',
  'approvals.view', 'approvals.manage',
  'handoff.manage', 'auto_mode.manage'
];

const ROLES = [
  { name: 'Superadmin', slug: 'superadmin', permissions: ['*'] },
  { name: 'Platform Admin', slug: 'platform-admin', permissions: ['users.view', 'users.edit', 'content.view', 'content.moderate', 'analytics.view', 'settings.view', 'integrations.view', 'audit.view'] },
  { name: 'Billing Admin', slug: 'billing-admin', permissions: ['plans.view', 'plans.create', 'plans.edit', 'billing.view', 'billing.manage'] },
  { name: 'AI Manager', slug: 'ai-manager', permissions: ['ai.view', 'ai.edit', 'plans.view'] },
  { name: 'Integration Manager', slug: 'integration-manager', permissions: ['integrations.view', 'integrations.edit'] },
  { name: 'Content Moderator', slug: 'content-moderator', permissions: ['content.view', 'content.moderate', 'approvals.view', 'approvals.manage'] },
  { name: 'Support Agent', slug: 'support-agent', permissions: ['users.view', 'billing.view', 'approvals.view'] },
  { name: 'Analyst', slug: 'analyst', permissions: ['analytics.view', 'audit.view'] }
];

async function main() {
  await connectDb();
  for (const role of ROLES) {
    await AdminRole.findOneAndUpdate({ slug: role.slug }, { ...role, isSystem: true, isActive: true }, { upsert: true, new: true });
  }
  console.log(`Seeded ${ROLES.length} admin roles and ${PERMISSIONS.length} permission names.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

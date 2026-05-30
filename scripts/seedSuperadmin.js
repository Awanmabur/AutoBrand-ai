const connectDb = require('../src/config/db');
const User = require('../src/models/User');
const { activatePlanForUser } = require('../src/services/subscription.service');

async function main() {
  await connectDb();
  const name = process.env.SUPERADMIN_NAME || 'Super Admin';
  const email = String(process.env.SUPERADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || 'ChangeMe123!';
  let user = await User.findOne({ email });
  if (!user) {
    user = new User({ name, email, role: 'super_admin', status: 'active', isVerified: true, plan: 'superadmin' });
    await user.setPassword(password);
    await user.save();
  } else {
    user.role = 'super_admin';
    user.status = 'active';
    user.isVerified = true;
    user.plan = 'superadmin';
    await user.save();
  }
  await activatePlanForUser(user, 'superadmin', { paymentProvider: 'manual', metadata: { seeded: true } });
  console.log(`Superadmin ready: ${email}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

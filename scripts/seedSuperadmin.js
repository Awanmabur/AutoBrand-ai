const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const User = require('../src/models/User');
const { activatePlanForUser } = require('../src/services/subscription.service');
const { validateEmail, validateName, validatePassword } = require('../src/services/account/account.service');

function boolEnv(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function resolveSeedIdentity() {
  const production = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const configuredEmail = String(process.env.SUPERADMIN_EMAIL || '').trim();
  const configuredName = String(process.env.SUPERADMIN_NAME || '').trim();

  if (production && !configuredEmail) {
    throw new Error('SUPERADMIN_EMAIL must be explicitly configured before running the superadmin seeder in production.');
  }

  return {
    production,
    name: validateName(configuredName || 'Super Admin'),
    email: validateEmail(configuredEmail || 'admin@example.com'),
    password: String(process.env.SUPERADMIN_PASSWORD || '')
  };
}

async function seedSuperadmin() {
  const identity = resolveSeedIdentity();
  await connectDb();

  let user = await User.findOne({ email: identity.email });
  if (!user) {
    if (!identity.password) {
      throw new Error('SUPERADMIN_PASSWORD is required when creating the superadmin account.');
    }
    const password = validatePassword(identity.password, 'SUPERADMIN_PASSWORD');
    user = new User({
      name: identity.name,
      email: identity.email,
      role: 'super_admin',
      status: 'active',
      isVerified: true,
      plan: 'superadmin'
    });
    await user.setPassword(password);
    await user.save();
  } else {
    if (user.role !== 'super_admin' && !boolEnv(process.env.SUPERADMIN_ALLOW_PROMOTION)) {
      throw new Error('The configured SUPERADMIN_EMAIL already belongs to a non-superadmin account. Set SUPERADMIN_ALLOW_PROMOTION=true only after verifying that this exact account should receive platform-wide privileges.');
    }
    user.name = identity.name || user.name;
    user.role = 'super_admin';
    user.status = 'active';
    user.isVerified = true;
    user.plan = 'superadmin';
    await user.save();
  }

  await activatePlanForUser(user, 'superadmin', { paymentProvider: 'free', metadata: { seeded: true } });
  console.log(`Superadmin ready: ${identity.email}`);
  return user;
}

async function main() {
  try {
    await seedSuperadmin();
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  } catch (error) {
    console.error(error);
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { boolEnv, resolveSeedIdentity, seedSuperadmin };

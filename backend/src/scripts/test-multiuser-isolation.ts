import dotenv from 'dotenv';
import { prisma } from '../config/db';
import { getAggregatedStorageQuota } from '../services/storage/cloudBalancer.service';
import bcrypt from 'bcrypt';
import { CloudProvider } from '@prisma/client';

dotenv.config();

async function testMultiUserIsolation() {
  console.log('\n======================================================');
  console.log('  🧪 Verifying Multi-Tenant User Cloud Isolation');
  console.log('======================================================\n');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Create or Find User A
  const userA = await prisma.user.upsert({
    where: { email: 'usera_test@cloudfusion.io' },
    update: {},
    create: {
      email: 'usera_test@cloudfusion.io',
      name: 'Alice MultiUser',
      passwordHash,
    },
  });
  console.log(`👤 User A created: ${userA.email} (${userA.id})`);

  // 2. Create or Find User B
  const userB = await prisma.user.upsert({
    where: { email: 'userb_test@cloudfusion.io' },
    update: {},
    create: {
      email: 'userb_test@cloudfusion.io',
      name: 'Bob MultiUser',
      passwordHash,
    },
  });
  console.log(`👤 User B created: ${userB.email} (${userB.id})`);

  // Clean previous test cloud accounts for clean isolation test
  await prisma.cloudAccount.deleteMany({
    where: { userId: { in: [userA.id, userB.id] } },
  });

  // 3. User A links Dropbox
  await prisma.cloudAccount.create({
    data: {
      userId: userA.id,
      provider: CloudProvider.DROPBOX,
      accountEmail: 'alice@dropbox.com',
      credentialsEncrypted: JSON.stringify({
        refreshToken: process.env.DROPBOX_REFRESH_TOKEN || 'test_token',
      }),
      totalStorageBytes: BigInt(2147483648), // 2 GB
      usedStorageBytes: BigInt(100000),
    },
  });
  console.log(`\n🔗 User A linked Dropbox (2 GB)`);

  // 4. User B links MEGA
  await prisma.cloudAccount.create({
    data: {
      userId: userB.id,
      provider: CloudProvider.MEGA,
      accountEmail: 'bob@mega.nz',
      credentialsEncrypted: JSON.stringify({
        email: 'bob@mega.nz',
        password: 'BobSecretPassword',
      }),
      totalStorageBytes: BigInt(21474836480), // 20 GB
      usedStorageBytes: BigInt(500000),
    },
  });
  console.log(`🔗 User B linked MEGA (20 GB)`);

  // 5. Query Quota for User A
  console.log('\n📊 Fetching Quota for User A...');
  const quotaA = await getAggregatedStorageQuota(userA.id);
  console.log('   - User A Total Quota:', (Number(quotaA.totalQuotaBytes) / (1024 * 1024 * 1024)).toFixed(2), 'GB');
  console.log('   - User A Dropbox Connected:', quotaA.providers.dropbox.isConnected);
  console.log('   - User A MEGA Connected:', quotaA.providers.mega.isConnected, '(MUST BE FALSE)');

  // 6. Query Quota for User B
  console.log('\n📊 Fetching Quota for User B...');
  const quotaB = await getAggregatedStorageQuota(userB.id);
  console.log('   - User B Total Quota:', (Number(quotaB.totalQuotaBytes) / (1024 * 1024 * 1024)).toFixed(2), 'GB');
  console.log('   - User B MEGA Connected:', quotaB.providers.mega.isConnected);
  console.log('   - User B Dropbox Connected:', quotaB.providers.dropbox.isConnected, '(MUST BE FALSE)');

  // 7. Assert Isolation
  const isolationPassed =
    quotaA.providers.dropbox.isConnected === true &&
    quotaA.providers.mega.isConnected === false &&
    quotaB.providers.mega.isConnected === true &&
    quotaB.providers.dropbox.isConnected === false;

  console.log('\n======================================================');
  if (isolationPassed) {
    console.log('  🎉 ISOLATION TEST PASSED: 100% User Cloud Separation!');
  } else {
    console.error('  ❌ ISOLATION TEST FAILED!');
  }
  console.log('======================================================\n');
}

testMultiUserIsolation()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

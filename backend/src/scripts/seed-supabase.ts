import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log('🌱 Starting CloudFusion Supabase Database Seed...');

  // Clean existing tables
  await prisma.$executeRawUnsafe(`DELETE FROM "audit_logs";`);
  await prisma.$executeRawUnsafe(`DELETE FROM "file_metadata";`);
  await prisma.$executeRawUnsafe(`DELETE FROM "storage_quotas";`);
  await prisma.$executeRawUnsafe(`DELETE FROM "cloud_accounts";`);
  await prisma.$executeRawUnsafe(`DELETE FROM "users";`);

  // Create hashed password for demo account
  const passwordHash = await bcrypt.hash('Password123!', 12);
  const userId = '0f28b281-b312-4263-a2a2-575461605495';

  // 1. Create Demo User
  await prisma.$executeRawUnsafe(`
    INSERT INTO "users" ("id", "email", "passwordHash", "name", "role", "isMfaEnabled")
    VALUES ('${userId}', 'admin@cloudfusion.io', '${passwordHash}', 'CloudFusion Administrator', 'ADMIN', true);
  `);
  console.log(`✅ Demo User Created: admin@cloudfusion.io (ID: ${userId})`);

  // 2. Create 5-Cloud Storage Quotas (52 GB Total)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "storage_quotas" ("id", "userId", "totalQuotaBytes", "usedQuotaBytes", "s3UsedBytes", "gdriveUsedBytes", "dropboxUsedBytes", "megaUsedBytes", "onedriveUsedBytes")
    VALUES ('sq-101', '${userId}', 55834574848, 10740000000, 950000000, 3800000000, 640000000, 4500000000, 1200000000);
  `);
  console.log(`✅ 5-Cloud Storage Quotas Initialized.`);

  // 3. Create Cloud Accounts
  await prisma.$executeRawUnsafe(`
    INSERT INTO "cloud_accounts" ("id", "userId", "provider", "accountEmail", "credentialsEncrypted", "isPrimary", "totalStorageBytes", "usedStorageBytes")
    VALUES
      ('ca-1', '${userId}', 'MEGA', 'admin@cloudfusion.io', '{"status":"connected","type":"E2EE"}', true, 21474836480, 4500000000),
      ('ca-2', '${userId}', 'GOOGLE_DRIVE', 'admin@cloudfusion.io', '{"status":"connected","type":"OAuth2"}', false, 16106127360, 3800000000),
      ('ca-3', '${userId}', 'ONEDRIVE', 'admin@cloudfusion.io', '{"status":"connected","type":"GraphAPI"}', false, 5368709120, 1200000000),
      ('ca-4', '${userId}', 'AWS_S3', 'admin@cloudfusion.io', '{"status":"connected","type":"KMS_S3"}', false, 5368709120, 950000000),
      ('ca-5', '${userId}', 'DROPBOX', 'admin@cloudfusion.io', '{"status":"connected","type":"BearerToken"}', false, 2147483648, 640000000);
  `);
  console.log(`✅ 5 Cloud Accounts Created.`);

  // 4. Create Initial Encrypted File Records
  await prisma.$executeRawUnsafe(`
    INSERT INTO "file_metadata" ("id", "userId", "originalName", "mimeType", "sizeBytes", "encryptedSizeBytes", "checksumSHA256", "aesInitializationVector", "aesAuthTag", "cloudProvider", "remoteFileId", "remoteFilePath", "isEncrypted", "status")
    VALUES
      ('fm-1', '${userId}', 'neural_weights_large_dataset.tar.gz', 'application/x-gzip', 450000000, 450000032, '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069', 'a1b2c3d4e5f678901234567890abcdef', '9876543210fedcba0987654321fedcba', 'MEGA', 'mega-obj-9901', '/cloudfusion/encrypted/mega/neural_weights.enc', true, 'ACTIVE'),
      ('fm-2', '${userId}', 'financial_report_2026.pdf', 'application/pdf', 14200000, 14200032, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'f1e2d3c4b5a698765432101234abcdef', '1234567890abcdef1234567890abcdef', 'AWS_S3', 's3-obj-8802', '/cloudfusion/encrypted/s3/financial_report.enc', true, 'ACTIVE');
  `);
  console.log(`✅ Sample File Metadata Created.`);

  // 5. Audit Log Entry
  await prisma.$executeRawUnsafe(`
    INSERT INTO "audit_logs" ("id", "userId", "action", "details", "ipAddress")
    VALUES ('al-1', '${userId}', 'USER_REGISTER', 'CloudFusion Database initialized with 5-Cloud Mesh telemetry.', '127.0.0.1');
  `);
  console.log(`✅ Security Audit Log Created.`);

  console.log('🎉 Supabase Database Seeding Complete!');
}

main()
  .catch((e) => console.error('❌ Seeding Error:', e))
  .finally(() => prisma.$disconnect());

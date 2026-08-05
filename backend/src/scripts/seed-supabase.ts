import { PrismaClient, CloudProvider, FileStatus, AuditAction, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log('🌱 Starting CloudFusion Supabase Database Seed...');

  // Clean existing tables using Prisma ORM
  await prisma.auditLog.deleteMany({});
  await prisma.fileMetadata.deleteMany({});
  await prisma.storageQuota.deleteMany({});
  await prisma.cloudAccount.deleteMany({});
  await prisma.user.deleteMany({});

  // Create hashed password for demo account
  const passwordHash = await bcrypt.hash('Password123!', 12);
  const userId = '0f28b281-b312-4263-a2a2-575461605495';

  // 1. Create Demo User
  await prisma.user.create({
    data: {
      id: userId,
      email: 'admin@cloudfusion.io',
      passwordHash,
      name: 'CloudFusion Administrator',
      role: Role.ADMIN,
      isMfaEnabled: true,
    },
  });
  console.log(`✅ Demo User Created: admin@cloudfusion.io (ID: ${userId})`);

  // 2. Create 5-Cloud Storage Quotas (52 GB Total)
  await prisma.storageQuota.create({
    data: {
      id: 'sq-101',
      userId,
      totalQuotaBytes: BigInt(55834574848),
      usedQuotaBytes: BigInt(10740000000),
      s3UsedBytes: BigInt(950000000),
      gdriveUsedBytes: BigInt(3800000000),
      dropboxUsedBytes: BigInt(640000000),
      megaUsedBytes: BigInt(4500000000),
      onedriveUsedBytes: BigInt(1200000000),
    },
  });
  console.log(`✅ 5-Cloud Storage Quotas Initialized.`);

  // 3. Create Cloud Accounts
  await prisma.cloudAccount.createMany({
    data: [
      { id: 'ca-1', userId, provider: CloudProvider.MEGA, accountEmail: 'admin@cloudfusion.io', credentialsEncrypted: '{"status":"connected","type":"E2EE"}', isPrimary: true, totalStorageBytes: BigInt(21474836480), usedStorageBytes: BigInt(4500000000) },
      { id: 'ca-2', userId, provider: CloudProvider.GOOGLE_DRIVE, accountEmail: 'admin@cloudfusion.io', credentialsEncrypted: '{"status":"connected","type":"OAuth2"}', isPrimary: false, totalStorageBytes: BigInt(16106127360), usedStorageBytes: BigInt(3800000000) },
      { id: 'ca-3', userId, provider: CloudProvider.ONEDRIVE, accountEmail: 'admin@cloudfusion.io', credentialsEncrypted: '{"status":"connected","type":"GraphAPI"}', isPrimary: false, totalStorageBytes: BigInt(5368709120), usedStorageBytes: BigInt(1200000000) },
      { id: 'ca-4', userId, provider: CloudProvider.AWS_S3, accountEmail: 'admin@cloudfusion.io', credentialsEncrypted: '{"status":"connected","type":"KMS_S3"}', isPrimary: false, totalStorageBytes: BigInt(5368709120), usedStorageBytes: BigInt(950000000) },
      { id: 'ca-5', userId, provider: CloudProvider.DROPBOX, accountEmail: 'admin@cloudfusion.io', credentialsEncrypted: '{"status":"connected","type":"BearerToken"}', isPrimary: false, totalStorageBytes: BigInt(2147483648), usedStorageBytes: BigInt(640000000) },
    ],
  });
  console.log(`✅ 5 Cloud Accounts Created.`);

  // 4. Create Initial Encrypted File Records
  await prisma.fileMetadata.createMany({
    data: [
      {
        id: 'fm-1',
        userId,
        originalName: 'neural_weights_large_dataset.tar.gz',
        mimeType: 'application/x-gzip',
        sizeBytes: BigInt(450000000),
        encryptedSizeBytes: BigInt(450000032),
        checksumSHA256: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
        aesInitializationVector: 'a1b2c3d4e5f678901234567890abcdef',
        aesAuthTag: '9876543210fedcba0987654321fedcba',
        cloudProvider: CloudProvider.MEGA,
        remoteFileId: 'mega-obj-9901',
        remoteFilePath: '/cloudfusion/encrypted/mega/neural_weights.enc',
        isEncrypted: true,
        status: FileStatus.ACTIVE,
      },
      {
        id: 'fm-2',
        userId,
        originalName: 'financial_report_2026.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(14200000),
        encryptedSizeBytes: BigInt(14200032),
        checksumSHA256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        aesInitializationVector: 'f1e2d3c4b5a698765432101234abcdef',
        aesAuthTag: '1234567890abcdef1234567890abcdef',
        cloudProvider: CloudProvider.AWS_S3,
        remoteFileId: 's3-obj-8802',
        remoteFilePath: '/cloudfusion/encrypted/s3/financial_report.enc',
        isEncrypted: true,
        status: FileStatus.ACTIVE,
      },
      {
        id: 'fm-3',
        userId,
        originalName: 'project_presentation.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        sizeBytes: BigInt(28500000),
        encryptedSizeBytes: BigInt(28500032),
        checksumSHA256: 'a1b2c3d4e5f678901234567890abcdefa1b2c3d4e5f678901234567890abcdef',
        aesInitializationVector: '11223344556677889900aabbccddeeff',
        aesAuthTag: 'aabbccddeeff11223344556677889900',
        cloudProvider: CloudProvider.GOOGLE_DRIVE,
        remoteFileId: 'gdrive-doc-7703',
        remoteFilePath: '/cloudfusion/encrypted/gdrive/presentation.enc',
        isEncrypted: true,
        status: FileStatus.ACTIVE,
      },
    ],
  });
  console.log(`✅ Sample File Metadata Created.`);

  // 5. Audit Log Entry
  await prisma.auditLog.create({
    data: {
      id: 'al-1',
      userId,
      action: AuditAction.USER_REGISTER,
      details: 'CloudFusion Database initialized with 5-Cloud Mesh telemetry.',
      ipAddress: '127.0.0.1',
    },
  });
  console.log(`✅ Security Audit Log Created.`);

  console.log('🎉 Supabase Database Seeding Complete!');
}

main()
  .catch((e) => console.error('❌ Seeding Error:', e))
  .finally(() => prisma.$disconnect());

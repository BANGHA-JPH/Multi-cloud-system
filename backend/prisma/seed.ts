import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting CloudFusion Database Seed...');

  // Clean existing tables
  await prisma.auditLog.deleteMany();
  await prisma.fileMetadata.deleteMany();
  await prisma.storageQuota.deleteMany();
  await prisma.cloudAccount.deleteMany();
  await prisma.user.deleteMany();

  // Create hashed password for demo account (Password: Password123!)
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // 1. Create Demo User
  const demoUser = await prisma.user.create({
    data: {
      email: 'admin@cloudfusion.io',
      name: 'CloudFusion Administrator',
      passwordHash,
      role: 'ADMIN',
      isMfaEnabled: true,
    },
  });
  console.log(`✅ Demo User Created: ${demoUser.email} (ID: ${demoUser.id})`);

  // 2. Create 5-Cloud Storage Quotas (52 GB Total)
  await prisma.storageQuota.create({
    data: {
      userId: demoUser.id,
      totalQuotaBytes: BigInt(55834574848), // ~52 GB Combined Free Pool
      usedQuotaBytes: BigInt(10740000000), // ~10.7 GB Used
      megaUsedBytes: BigInt(4500000000),    // 4.5 GB of 20 GB MEGA
      gdriveUsedBytes: BigInt(3800000000),  // 3.8 GB of 15 GB Google Drive
      onedriveUsedBytes: BigInt(1200000000), // 1.2 GB of 5 GB OneDrive
      s3UsedBytes: BigInt(950000000),       // 950 MB of 5 GB AWS S3
      dropboxUsedBytes: BigInt(640000000),  // 640 MB of 2 GB Dropbox
    },
  });
  console.log(`✅ 5-Cloud Storage Quotas Initialized for User.`);

  // 3. Create Sample Cloud Account Connection Records
  await prisma.cloudAccount.createMany({
    data: [
      {
        userId: demoUser.id,
        provider: 'MEGA',
        accountEmail: 'admin@cloudfusion.io',
        credentialsEncrypted: '{"status":"connected","type":"E2EE"}',
        isPrimary: true,
        totalStorageBytes: BigInt(21474836480), // 20 GB
        usedStorageBytes: BigInt(4500000000),
      },
      {
        userId: demoUser.id,
        provider: 'GOOGLE_DRIVE',
        accountEmail: 'admin@cloudfusion.io',
        credentialsEncrypted: '{"status":"connected","type":"OAuth2"}',
        isPrimary: false,
        totalStorageBytes: BigInt(16106127360), // 15 GB
        usedStorageBytes: BigInt(3800000000),
      },
      {
        userId: demoUser.id,
        provider: 'ONEDRIVE',
        accountEmail: 'admin@cloudfusion.io',
        credentialsEncrypted: '{"status":"connected","type":"GraphAPI"}',
        isPrimary: false,
        totalStorageBytes: BigInt(5368709120), // 5 GB
        usedStorageBytes: BigInt(1200000000),
      },
      {
        userId: demoUser.id,
        provider: 'AWS_S3',
        accountEmail: 'admin@cloudfusion.io',
        credentialsEncrypted: '{"status":"connected","type":"KMS_S3"}',
        isPrimary: false,
        totalStorageBytes: BigInt(5368709120), // 5 GB
        usedStorageBytes: BigInt(950000000),
      },
      {
        userId: demoUser.id,
        provider: 'DROPBOX',
        accountEmail: 'admin@cloudfusion.io',
        credentialsEncrypted: '{"status":"connected","type":"BearerToken"}',
        isPrimary: false,
        totalStorageBytes: BigInt(2147483648), // 2 GB
        usedStorageBytes: BigInt(640000000),
      },
    ],
  });
  console.log(`✅ 5 Cloud Accounts Connected in DB.`);

  // 4. Create Initial Encrypted File Records
  await prisma.fileMetadata.createMany({
    data: [
      {
        userId: demoUser.id,
        originalName: 'neural_weights_large_dataset.tar.gz',
        mimeType: 'application/x-gzip',
        sizeBytes: BigInt(450000000),
        encryptedSizeBytes: BigInt(450000032),
        checksumSHA256: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
        aesInitializationVector: 'a1b2c3d4e5f678901234567890abcdef',
        aesAuthTag: '9876543210fedcba0987654321fedcba',
        cloudProvider: 'MEGA',
        remoteFileId: 'mega-obj-9901',
        remoteFilePath: '/cloudfusion/encrypted/mega/neural_weights.enc',
        isEncrypted: true,
        status: 'ACTIVE',
      },
      {
        userId: demoUser.id,
        originalName: 'financial_report_2026.pdf',
        mimeType: 'application/pdf',
        sizeBytes: BigInt(14200000),
        encryptedSizeBytes: BigInt(14200032),
        checksumSHA256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        aesInitializationVector: 'f1e2d3c4b5a698765432101234abcdef',
        aesAuthTag: '1234567890abcdef1234567890abcdef',
        cloudProvider: 'AWS_S3',
        remoteFileId: 's3-obj-8802',
        remoteFilePath: '/cloudfusion/encrypted/s3/financial_report.enc',
        isEncrypted: true,
        status: 'ACTIVE',
      },
    ],
  });
  console.log(`✅ Sample AES-256 Encrypted File Metadata Created.`);

  // 5. Audit Log Entry
  await prisma.auditLog.create({
    data: {
      userId: demoUser.id,
      action: 'USER_REGISTER',
      details: 'CloudFusion Database initialized with 5-Cloud Mesh telemetry.',
      ipAddress: '127.0.0.1',
    },
  });
  console.log(`✅ Security Audit Log Entry Created.`);

  console.log('🎉 Database Seeding Complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

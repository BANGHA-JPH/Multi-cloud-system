import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log('🚀 Initializing Supabase PostgreSQL Tables...');

  // Drop existing tables
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "audit_logs" CASCADE;`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "file_metadata" CASCADE;`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "cloud_accounts" CASCADE;`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "storage_quotas" CASCADE;`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "users" CASCADE;`);

  // Create Postgres Enum Types
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
        CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
        CREATE TYPE "CloudProvider" AS ENUM ('AWS_S3', 'GOOGLE_DRIVE', 'DROPBOX', 'MEGA', 'ONEDRIVE');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
        CREATE TYPE "FileStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
        CREATE TYPE "AuditAction" AS ENUM ('USER_REGISTER', 'USER_LOGIN', 'FILE_UPLOAD', 'FILE_DOWNLOAD', 'FILE_DELETE', 'FILE_DECRYPT', 'INTEGRITY_CHECK', 'CLOUD_REBALANCE', 'CLOUD_ACCOUNT_LINK');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create Tables with matching PostgreSQL Enum columns
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "users" (
      "id" TEXT PRIMARY KEY,
      "email" TEXT UNIQUE NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "role" "Role" NOT NULL DEFAULT 'USER',
      "isMfaEnabled" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "cloud_accounts" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "provider" "CloudProvider" NOT NULL,
      "accountEmail" TEXT,
      "credentialsEncrypted" TEXT NOT NULL,
      "isPrimary" BOOLEAN NOT NULL DEFAULT false,
      "totalStorageBytes" BIGINT NOT NULL DEFAULT 21474836480,
      "usedStorageBytes" BIGINT NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "cloud_accounts_userId_provider_key" UNIQUE ("userId", "provider")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "file_metadata" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "originalName" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "sizeBytes" BIGINT NOT NULL,
      "encryptedSizeBytes" BIGINT NOT NULL,
      "checksumSHA256" TEXT NOT NULL,
      "aesInitializationVector" TEXT NOT NULL,
      "aesAuthTag" TEXT,
      "cloudProvider" "CloudProvider" NOT NULL,
      "remoteFileId" TEXT NOT NULL,
      "remoteFilePath" TEXT,
      "isEncrypted" BOOLEAN NOT NULL DEFAULT true,
      "status" "FileStatus" NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "audit_logs" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "action" "AuditAction" NOT NULL,
      "details" TEXT,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "storage_quotas" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "totalQuotaBytes" BIGINT NOT NULL DEFAULT 55834574848,
      "usedQuotaBytes" BIGINT NOT NULL DEFAULT 0,
      "s3UsedBytes" BIGINT NOT NULL DEFAULT 0,
      "gdriveUsedBytes" BIGINT NOT NULL DEFAULT 0,
      "dropboxUsedBytes" BIGINT NOT NULL DEFAULT 0,
      "megaUsedBytes" BIGINT NOT NULL DEFAULT 0,
      "onedriveUsedBytes" BIGINT NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('✅ All PostgreSQL Enum types & 5 Tables created cleanly on Supabase!');
}

main()
  .catch((e) => console.error('❌ Init error:', e))
  .finally(() => prisma.$disconnect());

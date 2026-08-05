import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  console.log('🔌 Testing Prisma Connection to Supabase PostgreSQL...');
  try {
    const result = await prisma.$queryRaw`SELECT 1 + 1 AS test;`;
    console.log('✅ Supabase PostgreSQL Connection SUCCESSFUL! Query result:', result);
  } catch (error) {
    console.error('❌ Connection Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();

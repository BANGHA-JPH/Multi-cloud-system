import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log('Testing Prisma Database Connection...');
  try {
    const userCount = await prisma.user.count();
    console.log('✅ Connection successful! Current user count:', userCount);
  } catch (err) {
    console.error('❌ Database connection error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

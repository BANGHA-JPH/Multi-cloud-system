import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log('Testing Prisma Database Connection...');
  try {
    const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, role: true } });
    console.log('✅ Current users in DB:', JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('❌ Database connection error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

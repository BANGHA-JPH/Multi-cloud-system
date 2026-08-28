import dotenv from 'dotenv';
import { prisma } from '../config/db';

dotenv.config();

async function cleanCloudAccounts() {
  console.log('Fetching all cloud accounts from database...');
  const allAccounts = await prisma.cloudAccount.findMany();
  console.log(`Found ${allAccounts.length} cloud account records.`);

  for (const acc of allAccounts) {
    console.log(`- ID: ${acc.id}, Provider: ${acc.provider}, Email: ${acc.accountEmail}`);
    if (acc.provider !== 'ONEDRIVE') {
      console.log(`  Deleting non-OneDrive account: ${acc.provider}...`);
      await prisma.cloudAccount.delete({ where: { id: acc.id } });
    }
  }

  console.log('\nRemaining cloud accounts in database:');
  const remaining = await prisma.cloudAccount.findMany();
  remaining.forEach(r => console.log(`- ${r.provider} (${r.accountEmail})`));
}

cleanCloudAccounts().catch(console.error);

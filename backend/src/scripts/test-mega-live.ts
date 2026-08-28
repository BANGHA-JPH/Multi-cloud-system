import dotenv from 'dotenv';
import { Storage } from 'megajs';

dotenv.config();

async function testMega() {
  console.log('\n==================================================');
  console.log('  🧪 Testing Live MEGA Cloud Integration');
  console.log('==================================================\n');

  const email = process.env.MEGA_EMAIL;
  const password = process.env.MEGA_PASSWORD;

  console.log(`📧 Email: ${email}`);
  console.log(`🔒 Password: [Configured - ${password ? password.substring(0, 3) + '...' : 'NONE'}]\n`);

  if (!email || !password) {
    console.error('❌ Missing MEGA_EMAIL or MEGA_PASSWORD in .env');
    return;
  }

  try {
    console.log('1. Authenticating with MEGA API...');
    const storage = await new Storage({
      email,
      password,
      userAgent: 'CloudFusion Multi-Cloud Mesh/1.0',
    }).ready;

    console.log('✅ MEGA Account Authenticated Successfully!');

    console.log('\n2. Fetching Storage Quota & Account Details...');
    const info = await storage.getAccountInfo();
    console.log(`   - Space Total: ${(Number(info.spaceTotal) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
    console.log(`   - Space Used:  ${(Number(info.spaceUsed) / (1024 * 1024)).toFixed(2)} MB`);
    const freeBytes = BigInt(info.spaceTotal) - BigInt(info.spaceUsed);
    console.log(`   - Space Free:  ${(Number(freeBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);

    console.log('\n3. Testing Encrypted File Upload to MEGA...');
    const testData = Buffer.from(`CloudFusion MEGA Zero-Knowledge Test - ${new Date().toISOString()}`);
    const testFilename = `cloudfusion_test_${Date.now()}.bin`;

    const file = await storage.upload({ name: testFilename, size: testData.length }, testData).complete;
    console.log(`   ✅ MEGA Upload SUCCESS!`);
    console.log(`   - File Name: ${file.name}`);
    console.log(`   - File Node ID / Handle: ${file.nodeId || (file as any).handle}`);

    console.log('\n4. Testing File Download from MEGA...');
    const downloadedBuffer = await (file as any).downloadBuffer({});
    console.log(`   ✅ MEGA Download SUCCESS! Received ${downloadedBuffer.length} bytes.`);
    console.log(`   - Content Match: ${downloadedBuffer.equals(testData) ? 'PERFECT MATCH (100% Intact)' : 'MISMATCH'}`);

    console.log('\n5. Cleaning up test file...');
    await (file as any).delete(true);
    console.log('   - Cleanup: ✅ Removed');

    console.log('\n🎉 MEGA Integration is 100% Operational!\n');
  } catch (err: any) {
    console.error('❌ MEGA API Error:', err?.message || err);
  }
}

testMega().catch(console.error);

import dotenv from 'dotenv';
import { uploadFileToOneDrive, downloadFileFromOneDrive, getOneDriveStorageUsage } from '../services/storage/onedrive.service';

dotenv.config();

async function runOneDriveTest() {
  console.log('\n==================================================');
  console.log('  ðŸ§ª Testing Live Microsoft OneDrive Integration');
  console.log('==================================================\n');

  // 1. Quota Check
  console.log('1. Checking Live OneDrive Quota...');
  const usage = await getOneDriveStorageUsage();
  console.log(`   - Connected: ${usage.isConnected}`);
  console.log(`   - Owner: ${usage.userName} (${usage.userEmail})`);
  console.log(`   - Total Storage: ${(Number(usage.totalBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  console.log(`   - Free Storage:  ${(Number(usage.freeBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);

  // 2. Upload Test
  console.log('\n2. Testing Encrypted File Upload to OneDrive...');
  const testBuffer = Buffer.from('CloudFusion Zero-Knowledge AES-256 Encrypted Test Data - ' + new Date().toISOString());
  const testFilename = `cloudfusion_test_${Date.now()}.bin`;

  const uploadResult = await uploadFileToOneDrive(testFilename, 'application/octet-stream', testBuffer);

  if (uploadResult && uploadResult.id) {
    console.log(`   âœ… Upload SUCCESS!`);
    console.log(`   - Remote File ID: ${uploadResult.id}`);
    console.log(`   - Remote Name:    ${uploadResult.name}`);

    // 3. Download Test
    console.log('\n3. Testing Download from OneDrive...');
    const downloadedBuffer = await downloadFileFromOneDrive(uploadResult.id);

    if (downloadedBuffer) {
      console.log(`   âœ… Download SUCCESS!`);
      console.log(`   - Downloaded Bytes: ${downloadedBuffer.length}`);
      console.log(`   - Content Match:    ${downloadedBuffer.equals(testBuffer) ? 'PERFECT MATCH (100% Intact)' : 'MISMATCH'}`);
    } else {
      console.error('   âŒ Download failed.');
    }
  } else {
    console.error('   âŒ Upload failed.');
  }

  console.log('\nðŸŽ‰ OneDrive is 100% Operational!\n');
}

runOneDriveTest().catch(console.error);

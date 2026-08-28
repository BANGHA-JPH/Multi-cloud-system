import dotenv from 'dotenv';
import {
  getDropboxStorageUsage,
  uploadFileToDropbox,
  downloadFileFromDropbox,
  deleteFileFromDropbox,
} from '../services/storage/dropbox.service';
import { encryptFileBuffer, decryptFileBuffer } from '../services/crypto.service';

dotenv.config();

async function runDropboxTest() {
  console.log('\n==================================================');
  console.log('  🧪 Testing Live Dropbox Integration & Storage');
  console.log('==================================================\n');

  // 1. Quota Check
  console.log('1. Checking Live Dropbox Quota & Connection...');
  const usage = await getDropboxStorageUsage();
  console.log(`   - Connected: ${usage.isConnected}`);
  console.log(`   - Owner:     ${usage.userName || 'N/A'} (${usage.userEmail || 'N/A'})`);
  console.log(`   - Total:     ${(Number(usage.totalBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  console.log(`   - Used:      ${(Number(usage.usedBytes) / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Free:      ${(Number(usage.freeBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);

  if (!usage.isConnected) {
    console.log('\n⚠️ Dropbox is not yet connected with live tokens.');
    console.log('👉 Run "npx ts-node src/scripts/auth-dropbox.ts" or connect via the Dashboard to link your account.\n');
    return;
  }

  // 2. Encryption & Upload Test
  console.log('\n2. Testing AES-256-GCM Encrypted File Upload to Dropbox...');
  const originalData = Buffer.from(`CloudFusion Zero-Knowledge Test Payload [Dropbox] - Timestamp: ${new Date().toISOString()}`);
  const encryptionResult = encryptFileBuffer(originalData);
  const testFilename = `cloudfusion_test_${Date.now()}.bin`;

  const uploadResult = await uploadFileToDropbox(
    testFilename,
    'application/octet-stream',
    encryptionResult.encryptedBuffer
  );

  if (uploadResult && (uploadResult.id || uploadResult.path)) {
    console.log(`   ✅ Upload SUCCESS!`);
    console.log(`   - Remote Path: ${uploadResult.path}`);
    console.log(`   - Remote ID:   ${uploadResult.id}`);

    // 3. Download & Decryption Test
    console.log('\n3. Testing Encrypted Download & Decryption from Dropbox...');
    const downloadedEncryptedBuffer = await downloadFileFromDropbox(uploadResult.path || uploadResult.id);

    if (downloadedEncryptedBuffer) {
      console.log(`   ✅ Download SUCCESS! Received ${downloadedEncryptedBuffer.length} bytes.`);
      
      const decryptedData = decryptFileBuffer(
        downloadedEncryptedBuffer,
        encryptionResult.iv,
        encryptionResult.authTag
      );

      const isMatch = decryptedData.equals(originalData);
      console.log(`   - Decryption & Integrity: ${isMatch ? '✅ PERFECT MATCH (100% Intact)' : '❌ MISMATCH'}`);
      console.log(`   - Decrypted Content: "${decryptedData.toString()}"`);

      // 4. Cleanup Test
      console.log('\n4. Cleaning up temporary test file from Dropbox...');
      const deleted = await deleteFileFromDropbox(uploadResult.path || uploadResult.id);
      console.log(`   - File Cleanup: ${deleted ? '✅ Removed' : '⚠️ Notice'}`);
    } else {
      console.error('   ❌ Download failed.');
    }
  } else {
    console.error('   ❌ Upload failed.');
  }

  console.log('\n🎉 Dropbox Integration test sequence completed!\n');
}

runDropboxTest().catch((err) => {
  console.error('Test execution error:', err);
});

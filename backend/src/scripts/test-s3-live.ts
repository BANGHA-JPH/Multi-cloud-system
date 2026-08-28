import dotenv from 'dotenv';
import { S3Client, ListBucketsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getS3StorageUsage, uploadFileToS3, downloadFileFromS3 } from '../services/storage/s3.service';
import { encryptFileBuffer, decryptFileBuffer } from '../services/crypto.service';

dotenv.config();

async function runS3Test() {
  console.log('\n==================================================');
  console.log('  🧪 Testing Live AWS S3 Integration & Storage');
  console.log('==================================================\n');

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';
  const bucketName = process.env.AWS_S3_BUCKET_NAME;

  console.log(`🔑 Access Key ID: ${accessKeyId ? accessKeyId.substring(0, 8) + '...' : 'NONE'}`);
  console.log(`📍 Region: ${region}`);
  console.log(`🪣 Target Bucket: ${bucketName}\n`);

  if (!accessKeyId || !secretAccessKey) {
    console.error('❌ Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY in .env');
    return;
  }

  // 1. Connection & Bucket List
  console.log('1. Checking AWS S3 Connection & Bucket Accessibility...');
  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  try {
    const listBucketsRes = await s3.send(new ListBucketsCommand({}));
    console.log('✅ AWS S3 Authenticated Successfully!');
    console.log('   - Buckets Found:', listBucketsRes.Buckets?.map((b) => b.Name).join(', ') || 'None');
  } catch (err: any) {
    console.error('❌ AWS S3 Authentication/Listing Error:', err?.message || err);
  }

  // 2. Storage Quota Check
  console.log('\n2. Fetching S3 Storage Quota Metrics...');
  try {
    const quota = await getS3StorageUsage();
    console.log(`   - Provider:     ${quota.provider}`);
    console.log(`   - Total Quota:  ${(Number(quota.totalBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
    console.log(`   - Used Storage: ${(Number(quota.usedBytes) / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`   - Free Storage: ${(Number(quota.freeBytes) / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  } catch (err: any) {
    console.warn('⚠️ Quota notice:', err?.message || err);
  }

  // 3. Encrypted Upload Test
  console.log('\n3. Testing Zero-Knowledge AES-256 Encrypted Upload to S3...');
  const originalPayload = Buffer.from(`CloudFusion AWS S3 Test Payload - Timestamp: ${new Date().toISOString()}`);
  const encryptionResult = encryptFileBuffer(originalPayload);
  const testFilename = `cloudfusion_s3_test_${Date.now()}.bin`;

  try {
    const uploadRes = await uploadFileToS3(
      testFilename,
      'application/octet-stream',
      encryptionResult.encryptedBuffer
    );

    if (uploadRes && uploadRes.id) {
      console.log(`   ✅ S3 Upload SUCCESS! Key: ${uploadRes.id}`);

      // 4. Download & Decrypt Test
      console.log('\n4. Testing S3 Encrypted Download & Decryption...');
      const downloadedBuffer = await downloadFileFromS3(uploadRes.id);

      if (downloadedBuffer) {
        console.log(`   ✅ S3 Download SUCCESS! Received ${downloadedBuffer.length} bytes.`);
        const decryptedBuffer = decryptFileBuffer(
          downloadedBuffer,
          encryptionResult.iv,
          encryptionResult.authTag
        );
        const isMatch = decryptedBuffer.equals(originalPayload);
        console.log(`   - Integrity Check: ${isMatch ? '✅ PERFECT MATCH (100% Intact)' : '❌ MISMATCH'}`);
        console.log(`   - Decrypted Content: "${decryptedBuffer.toString()}"`);
      } else {
        console.error('   ❌ S3 Download returned null.');
      }
    } else {
      console.error('   ❌ S3 Upload failed.');
    }
  } catch (err: any) {
    console.error('❌ S3 Upload/Download Error:', err?.message || err);
  }

  console.log('\n🎉 AWS S3 Integration test sequence finished!\n');
}

runS3Test().catch(console.error);

import dotenv from 'dotenv';
import { google } from 'googleapis';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

dotenv.config();

async function testAll() {
  console.log('=== 1. TESTING GOOGLE DRIVE ===');
  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });
    const about = await drive.about.get({ fields: 'user, storageQuota' });
    console.log('âœ… Google Drive Connected!');
    console.log('   - User:', about.data.user?.displayName, `(${about.data.user?.emailAddress})`);
    if (about.data.storageQuota) {
      console.log('   - Total:', (Number(about.data.storageQuota.limit) / (1024 * 1024 * 1024)).toFixed(2), 'GB');
      console.log('   - Usage:', (Number(about.data.storageQuota.usage) / (1024 * 1024 * 1024)).toFixed(2), 'GB');
    }
  } catch (e: any) {
    console.error('âŒ Google Drive Error:', e.message || e);
  }

  console.log('\n=== 2. TESTING AWS S3 ===');
  try {
    const s3 = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    const res = await s3.send(new ListBucketsCommand({}));
    console.log('âœ… AWS S3 Connected!');
    console.log('   - Target Bucket:', process.env.AWS_S3_BUCKET_NAME);
    console.log('   - Available Buckets:', res.Buckets?.map(b => b.Name).join(', '));
  } catch (e: any) {
    console.error('âŒ AWS S3 Error:', e.message || e);
  }
}

testAll();

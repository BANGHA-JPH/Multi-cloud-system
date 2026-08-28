import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

export interface CloudStorageUsage {
  provider: 'AWS_S3';
  totalBytes: bigint;
  usedBytes: bigint;
  freeBytes: bigint;
  isConnected: boolean;
}

export interface S3UserCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  bucketName?: string;
}

export function getS3Client(credentials?: S3UserCredentials): S3Client | null {
  const accessKeyId = credentials?.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = credentials?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
  const region = credentials?.region || process.env.AWS_REGION || 'eu-north-1';

  if (
    !accessKeyId ||
    !secretAccessKey ||
    accessKeyId.includes('placeholder') ||
    accessKeyId.includes('your_')
  ) {
    return null;
  }

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export async function verifyS3Credentials(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  bucketName: string
): Promise<{ success: boolean; error?: string; availableBuckets?: string[] }> {
  try {
    const s3 = new S3Client({
      region: region || 'eu-north-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const listRes = await s3.send(new ListBucketsCommand({}));
    const availableBuckets = listRes.Buckets?.map((b) => b.Name || '') || [];

    if (bucketName) {
      await s3.send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 }));
    }

    return { success: true, availableBuckets };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to authenticate with AWS S3' };
  }
}

export async function getS3StorageUsage(credentials?: S3UserCredentials): Promise<CloudStorageUsage> {
  const DEFAULT_S3_FREE_TIER = BigInt(5368709120); // 5 GB AWS Free Tier
  const s3 = getS3Client(credentials);

  if (!s3) {
    const isConnected = !!(
      credentials?.accessKeyId ||
      (process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        !process.env.AWS_ACCESS_KEY_ID.includes('placeholder'))
    );
    return {
      provider: 'AWS_S3',
      totalBytes: DEFAULT_S3_FREE_TIER,
      usedBytes: BigInt(0),
      freeBytes: DEFAULT_S3_FREE_TIER,
      isConnected,
    };
  }

  try {
    const bucketName =
      credentials?.bucketName ||
      process.env.AWS_S3_BUCKET_NAME ||
      'cloudfusion-storage-bucket-390630837624-eu-north-1-an';
    const command = new ListObjectsV2Command({ Bucket: bucketName });
    const response = await s3.send(command);

    let usedBytes = BigInt(0);
    if (response.Contents) {
      for (const item of response.Contents) {
        if (item.Size) {
          usedBytes += BigInt(item.Size);
        }
      }
    }

    return {
      provider: 'AWS_S3',
      totalBytes: DEFAULT_S3_FREE_TIER,
      usedBytes,
      freeBytes:
        DEFAULT_S3_FREE_TIER - usedBytes > BigInt(0)
          ? DEFAULT_S3_FREE_TIER - usedBytes
          : BigInt(0),
      isConnected: true,
    };
  } catch (error) {
    console.warn('AWS S3 Live Quota Notice:', error);
    return {
      provider: 'AWS_S3',
      totalBytes: DEFAULT_S3_FREE_TIER,
      usedBytes: BigInt(0),
      freeBytes: DEFAULT_S3_FREE_TIER,
      isConnected: true,
    };
  }
}

export async function uploadFileToS3(
  filename: string,
  mimeType: string,
  fileBuffer: Buffer,
  credentials?: S3UserCredentials
): Promise<{ id: string; name: string } | null> {
  try {
    const s3 = getS3Client(credentials);
    if (!s3) return null;

    const bucketName =
      credentials?.bucketName ||
      process.env.AWS_S3_BUCKET_NAME ||
      'cloudfusion-storage-bucket-390630837624-eu-north-1-an';
    const key = `encrypted/${Date.now()}_${filename}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType || 'application/octet-stream',
    });

    await s3.send(command);
    console.log(`[AWS S3 API] Live File Upload Succeeded! Key: ${key}`);
    return { id: key, name: filename };
  } catch (err) {
    console.error('[AWS S3 API] Error during file upload:', err);
    return null;
  }
}

export async function downloadFileFromS3(
  remoteFileId: string,
  credentials?: S3UserCredentials
): Promise<Buffer | null> {
  try {
    const s3 = getS3Client(credentials);
    if (!s3) return null;

    const bucketName =
      credentials?.bucketName ||
      process.env.AWS_S3_BUCKET_NAME ||
      'cloudfusion-storage-bucket-390630837624-eu-north-1-an';
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: remoteFileId,
    });

    const response = await s3.send(command);
    if (!response.Body) return null;

    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    return buffer;
  } catch (err) {
    console.error('[AWS S3 API] Error during file download:', err);
    return null;
  }
}

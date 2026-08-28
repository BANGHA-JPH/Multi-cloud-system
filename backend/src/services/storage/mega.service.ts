import { Storage, File } from 'megajs';
import dotenv from 'dotenv';

dotenv.config();

export interface MegaStorageUsage {
  provider: 'MEGA';
  totalBytes: bigint;
  usedBytes: bigint;
  freeBytes: bigint;
  isConnected: boolean;
  email?: string;
}

export interface MegaUserCredentials {
  email?: string;
  password?: string;
}

let cachedStorage: Storage | null = null;
let storageInitPromise: Promise<Storage | null> | null = null;

function getEmail(credentials?: MegaUserCredentials): string {
  if (credentials?.email) return credentials.email;
  if (process.env.MEGA_EMAIL && !process.env.MEGA_EMAIL.includes('placeholder')) {
    return process.env.MEGA_EMAIL;
  }
  dotenv.config();
  return process.env.MEGA_EMAIL || 'mbahemile35@gmail.com';
}

function getPassword(credentials?: MegaUserCredentials): string {
  if (credentials?.password) return credentials.password;
  if (process.env.MEGA_PASSWORD) {
    return process.env.MEGA_PASSWORD;
  }
  dotenv.config();
  return process.env.MEGA_PASSWORD || 'Banghaemile12';
}

/**
 * Get authenticated MEGA client instance
 */
export async function getMegaStorageClient(credentials?: MegaUserCredentials): Promise<Storage | null> {
  const email = getEmail(credentials);
  const password = getPassword(credentials);

  if (!email || !password || email.includes('placeholder') || email.includes('your_')) {
    return null;
  }

  // If custom user credentials, instantiate directly without global cache collision
  if (credentials?.email && credentials?.password) {
    try {
      const storage = new Storage({
        email,
        password,
        userAgent: 'CloudFusion Multi-Cloud Mesh/1.0',
      });
      await Promise.race([
        storage.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('MEGA auth timeout')), 20000)),
      ]);
      return storage;
    } catch (err) {
      console.warn('[MEGA Service] User authentication notice:', err);
      return null;
    }
  }

  if (cachedStorage) {
    return cachedStorage;
  }

  if (storageInitPromise) {
    return storageInitPromise;
  }

  storageInitPromise = (async () => {
    try {
      const storage = new Storage({
        email,
        password,
        userAgent: 'CloudFusion Multi-Cloud Mesh/1.0',
      });
      await Promise.race([
        storage.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('MEGA auth timeout')), 20000)),
      ]);

      cachedStorage = storage;
      return storage;
    } catch (err) {
      console.warn('[MEGA Service] Authentication notice:', err);
      return null;
    } finally {
      storageInitPromise = null;
    }
  })();

  return storageInitPromise;
}

/**
 * Verify credentials for MEGA
 */
export async function verifyMegaCredentials(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  // If it's the platform default node, verify instantly
  if (
    email === (process.env.MEGA_EMAIL || 'mbahemile35@gmail.com') &&
    password === (process.env.MEGA_PASSWORD || 'Banghaemile12')
  ) {
    return { success: true };
  }

  try {
    const storage = new Storage({
      email,
      password,
      userAgent: 'CloudFusion Multi-Cloud Mesh/1.0',
    });
    await Promise.race([
      storage.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('MEGA connection timeout. Please check your credentials or try again.')), 20000)),
    ]);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to authenticate with MEGA' };
  }
}

/**
 * Get real-time storage quota and usage from MEGA
 */
export async function getMegaStorageUsage(credentials?: MegaUserCredentials): Promise<MegaStorageUsage> {
  const DEFAULT_MEGA_FREE_TIER = BigInt(21474836480); // 20 GB Free Tier
  const email = getEmail(credentials);

  try {
    const storage = await getMegaStorageClient(credentials);

    if (!storage) {
      const isConnected = !!(
        credentials?.email ||
        (email &&
          !email.includes('placeholder') &&
          !email.includes('your_') &&
          getPassword(credentials))
      );
      return {
        provider: 'MEGA',
        totalBytes: DEFAULT_MEGA_FREE_TIER,
        usedBytes: BigInt(0),
        freeBytes: DEFAULT_MEGA_FREE_TIER,
        isConnected,
        email,
      };
    }

    const info = await storage.getAccountInfo();
    const totalBytes = info.spaceTotal ? BigInt(info.spaceTotal) : DEFAULT_MEGA_FREE_TIER;
    const usedBytes = info.spaceUsed ? BigInt(info.spaceUsed) : BigInt(0);
    const freeBytes = totalBytes - usedBytes > BigInt(0) ? totalBytes - usedBytes : BigInt(0);

    return {
      provider: 'MEGA',
      totalBytes,
      usedBytes,
      freeBytes,
      isConnected: true,
      email,
    };
  } catch (error) {
    console.warn('[MEGA Service] Quota fetch error notice:', error);
    return {
      provider: 'MEGA',
      totalBytes: DEFAULT_MEGA_FREE_TIER,
      usedBytes: BigInt(0),
      freeBytes: DEFAULT_MEGA_FREE_TIER,
      isConnected: true,
      email,
    };
  }
}

/**
 * Upload Encrypted File Buffer to MEGA
 */
export async function uploadFileToMega(
  filename: string,
  _mimeType: string,
  fileBuffer: Buffer,
  credentials?: MegaUserCredentials
): Promise<{ id: string; name: string } | null> {
  try {
    const storage = await getMegaStorageClient(credentials);
    if (!storage) {
      console.warn('[MEGA Service] Cannot upload: MEGA storage client not authenticated.');
      return null;
    }

    const safeFilename = filename.replace(/[\\/:*?"<>|]/g, '_');
    const file = await storage.upload(
      {
        name: safeFilename,
        size: fileBuffer.length,
      },
      fileBuffer
    ).complete;

    const remoteId = (file as any).nodeId || (file as any).handle || safeFilename;
    console.log(`[MEGA API] Live File Upload Succeeded! Remote ID: ${remoteId}, Name: ${file.name}`);

    return {
      id: remoteId,
      name: file.name || safeFilename,
    };
  } catch (err) {
    console.error('[MEGA API] Error during file upload:', err);
    return null;
  }
}

/**
 * Download Encrypted File Buffer from MEGA
 */
export async function downloadFileFromMega(
  remoteFileIdOrName: string,
  credentials?: MegaUserCredentials
): Promise<Buffer | null> {
  try {
    const storage = await getMegaStorageClient(credentials);
    if (!storage) {
      console.warn('[MEGA Service] Cannot download: MEGA storage client not authenticated.');
      return null;
    }

    const files = storage.root.children || [];
    const targetFile = files.find(
      (f) =>
        (f as any).nodeId === remoteFileIdOrName ||
        (f as any).handle === remoteFileIdOrName ||
        f.name === remoteFileIdOrName
    );

    if (!targetFile) {
      console.warn(`[MEGA API] File "${remoteFileIdOrName}" not found in root directory.`);
      return null;
    }

    const buffer = await (targetFile as any).downloadBuffer({});
    return buffer;
  } catch (err) {
    console.error('[MEGA API] Error during file download:', err);
    return null;
  }
}

/**
 * Delete File from MEGA
 */
export async function deleteFileFromMega(
  remoteFileIdOrName: string,
  credentials?: MegaUserCredentials
): Promise<boolean> {
  try {
    const storage = await getMegaStorageClient(credentials);
    if (!storage) return false;

    const files = storage.root.children || [];
    const targetFile = files.find(
      (f) =>
        (f as any).nodeId === remoteFileIdOrName ||
        (f as any).handle === remoteFileIdOrName ||
        f.name === remoteFileIdOrName
    );

    if (!targetFile) return false;

    await (targetFile as any).delete(true);
    return true;
  } catch (err) {
    console.error('[MEGA API] Error deleting file:', err);
    return false;
  }
}

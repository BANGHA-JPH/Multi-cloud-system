import { prisma } from '../../config/db';
import { getOneDriveStorageUsage } from './onedrive.service';
import { getGDriveStorageUsage } from './gdrive.service';
import { getDropboxStorageUsage } from './dropbox.service';
import { getS3StorageUsage } from './s3.service';
import { getMegaStorageUsage } from './mega.service';

export interface AggregateStorageQuota {
  totalQuotaBytes: string;
  usedQuotaBytes: string;
  freeQuotaBytes: string;
  providers: {
    mega: { total: string; used: string; free: string; isConnected: boolean };
    gdrive: { total: string; used: string; free: string; isConnected: boolean };
    onedrive: { total: string; used: string; free: string; isConnected: boolean };
    s3: { total: string; used: string; free: string; isConnected: boolean };
    dropbox: { total: string; used: string; free: string; isConnected: boolean };
  };
}

export enum CloudProviderEnum {
  AWS_S3 = 'AWS_S3',
  GOOGLE_DRIVE = 'GOOGLE_DRIVE',
  DROPBOX = 'DROPBOX',
  MEGA = 'MEGA',
  ONEDRIVE = 'ONEDRIVE',
}

function parseCredentials(credStr?: string): Record<string, any> {
  if (!credStr) return {};
  try {
    return JSON.parse(credStr);
  } catch {
    return {};
  }
}

export async function getAggregatedStorageQuota(userId?: string): Promise<AggregateStorageQuota> {
  const connectedMap: Record<string, boolean> = {
    MEGA: false,
    GOOGLE_DRIVE: false,
    ONEDRIVE: false,
    AWS_S3: false,
    DROPBOX: false,
  };

  const credentialsMap: Record<string, any> = {
    MEGA: null,
    GOOGLE_DRIVE: null,
    ONEDRIVE: null,
    AWS_S3: null,
    DROPBOX: null,
  };

  // If userId provided, look up accounts exclusively for this user
  if (userId) {
    try {
      const userAccounts = await prisma.cloudAccount.findMany({
        where: { userId },
      });

      userAccounts.forEach((acc) => {
        const prov = acc.provider.toUpperCase();
        connectedMap[prov] = true;
        credentialsMap[prov] = parseCredentials(acc.credentialsEncrypted);
      });
    } catch (e) {
      console.warn('Accounts query notice:', e);
    }
  } else {
    // Global fallback for scripts/tests
    if (process.env.ONEDRIVE_REFRESH_TOKEN) connectedMap.ONEDRIVE = true;
    if (process.env.GOOGLE_REFRESH_TOKEN && !process.env.GOOGLE_REFRESH_TOKEN.includes('placeholder')) {
      connectedMap.GOOGLE_DRIVE = true;
    }
    if (
      process.env.DROPBOX_REFRESH_TOKEN ||
      (process.env.DROPBOX_ACCESS_TOKEN && !process.env.DROPBOX_ACCESS_TOKEN.includes('placeholder'))
    ) {
      connectedMap.DROPBOX = true;
    }
    if (
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      !process.env.AWS_ACCESS_KEY_ID.includes('placeholder')
    ) {
      connectedMap.AWS_S3 = true;
    }
    if (
      process.env.MEGA_EMAIL &&
      process.env.MEGA_PASSWORD &&
      !process.env.MEGA_EMAIL.includes('placeholder')
    ) {
      connectedMap.MEGA = true;
    }
  }

  // 1. Microsoft OneDrive
  let onedriveTotal = BigInt(0);
  let onedriveUsed = BigInt(0);
  if (connectedMap.ONEDRIVE) {
    try {
      const liveOneDrive = await getOneDriveStorageUsage(credentialsMap.ONEDRIVE || undefined);
      onedriveTotal = liveOneDrive.totalBytes;
      onedriveUsed = liveOneDrive.usedBytes;
    } catch {
      onedriveTotal = BigInt(5368709120);
    }
  }

  // 2. Google Drive
  let gdriveTotal = BigInt(0);
  let gdriveUsed = BigInt(0);
  if (connectedMap.GOOGLE_DRIVE) {
    try {
      const liveGDrive = await getGDriveStorageUsage(credentialsMap.GOOGLE_DRIVE || undefined);
      gdriveTotal = liveGDrive.totalBytes;
      gdriveUsed = liveGDrive.usedBytes;
    } catch {
      gdriveTotal = BigInt(16106127360);
    }
  }

  // 3. Dropbox
  let dropboxTotal = BigInt(0);
  let dropboxUsed = BigInt(0);
  if (connectedMap.DROPBOX) {
    try {
      const liveDropbox = await getDropboxStorageUsage(credentialsMap.DROPBOX || undefined);
      dropboxTotal = liveDropbox.totalBytes;
      dropboxUsed = liveDropbox.usedBytes;
    } catch {
      dropboxTotal = BigInt(2147483648);
    }
  }

  // 4. AWS S3
  let s3Total = BigInt(0);
  let s3Used = BigInt(0);
  if (connectedMap.AWS_S3) {
    try {
      const liveS3 = await getS3StorageUsage(credentialsMap.AWS_S3 || undefined);
      s3Total = liveS3.totalBytes;
      s3Used = liveS3.usedBytes;
    } catch {
      s3Total = BigInt(5368709120);
    }
  }

  // 5. MEGA Cloud
  let megaTotal = BigInt(0);
  let megaUsed = BigInt(0);
  if (connectedMap.MEGA) {
    try {
      const liveMega = await getMegaStorageUsage(credentialsMap.MEGA || undefined);
      megaTotal = liveMega.totalBytes;
      megaUsed = liveMega.usedBytes;
    } catch {
      megaTotal = BigInt(21474836480);
    }
  }

  // Factor in active database records for this user
  if (userId) {
    try {
      const files = await prisma.fileMetadata.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { cloudProvider: true, sizeBytes: true },
      });
      files.forEach((f) => {
        const prov = f.cloudProvider.toUpperCase();
        if (prov === 'ONEDRIVE') onedriveUsed += f.sizeBytes;
        else if (prov === 'GOOGLE_DRIVE') gdriveUsed += f.sizeBytes;
        else if (prov === 'DROPBOX') dropboxUsed += f.sizeBytes;
        else if (prov === 'AWS_S3' || prov === 'S3') s3Used += f.sizeBytes;
        else if (prov === 'MEGA') megaUsed += f.sizeBytes;
      });
    } catch (e) {
      console.warn('Files usage notice:', e);
    }
  }

  const totalQuota = onedriveTotal + gdriveTotal + dropboxTotal + s3Total + megaTotal;
  const usedQuota = onedriveUsed + gdriveUsed + dropboxUsed + s3Used + megaUsed;
  const freeQuota = totalQuota - usedQuota > BigInt(0) ? totalQuota - usedQuota : BigInt(0);

  return {
    totalQuotaBytes: totalQuota.toString(),
    usedQuotaBytes: usedQuota.toString(),
    freeQuotaBytes: freeQuota.toString(),
    providers: {
      onedrive: {
        total: onedriveTotal.toString(),
        used: onedriveUsed.toString(),
        free: (onedriveTotal - onedriveUsed > BigInt(0) ? onedriveTotal - onedriveUsed : BigInt(0)).toString(),
        isConnected: connectedMap.ONEDRIVE,
      },
      gdrive: {
        total: gdriveTotal.toString(),
        used: gdriveUsed.toString(),
        free: (gdriveTotal - gdriveUsed > BigInt(0) ? gdriveTotal - gdriveUsed : BigInt(0)).toString(),
        isConnected: connectedMap.GOOGLE_DRIVE,
      },
      dropbox: {
        total: dropboxTotal.toString(),
        used: dropboxUsed.toString(),
        free: (dropboxTotal - dropboxUsed > BigInt(0) ? dropboxTotal - dropboxUsed : BigInt(0)).toString(),
        isConnected: connectedMap.DROPBOX,
      },
      s3: {
        total: s3Total.toString(),
        used: s3Used.toString(),
        free: (s3Total - s3Used > BigInt(0) ? s3Total - s3Used : BigInt(0)).toString(),
        isConnected: connectedMap.AWS_S3,
      },
      mega: {
        total: megaTotal.toString(),
        used: megaUsed.toString(),
        free: (megaTotal - megaUsed > BigInt(0) ? megaTotal - megaUsed : BigInt(0)).toString(),
        isConnected: connectedMap.MEGA,
      },
    },
  };
}

export class CloudBalancerService {
  static selectOptimalProvider(
    _fileSize: number,
    quota: AggregateStorageQuota,
    preferredProvider?: string
  ): CloudProviderEnum {
    if (preferredProvider && preferredProvider !== 'AI' && preferredProvider !== 'AUTO') {
      const normalized = preferredProvider.toUpperCase();
      if (normalized === 'ONEDRIVE' || normalized === 'MS ONEDRIVE') return CloudProviderEnum.ONEDRIVE;
      if (normalized === 'GOOGLE_DRIVE' || normalized === 'GDRIVE') return CloudProviderEnum.GOOGLE_DRIVE;
      if (normalized === 'AWS_S3' || normalized === 'S3') return CloudProviderEnum.AWS_S3;
      if (normalized === 'DROPBOX') return CloudProviderEnum.DROPBOX;
      if (normalized === 'MEGA') return CloudProviderEnum.MEGA;
    }

    // AI Balancer: select connected provider with largest free storage
    const candidates: Array<{ provider: CloudProviderEnum; freeBytes: bigint }> = [];
    if (quota.providers.onedrive.isConnected) {
      candidates.push({ provider: CloudProviderEnum.ONEDRIVE, freeBytes: BigInt(quota.providers.onedrive.free) });
    }
    if (quota.providers.gdrive.isConnected) {
      candidates.push({ provider: CloudProviderEnum.GOOGLE_DRIVE, freeBytes: BigInt(quota.providers.gdrive.free) });
    }
    if (quota.providers.dropbox.isConnected) {
      candidates.push({ provider: CloudProviderEnum.DROPBOX, freeBytes: BigInt(quota.providers.dropbox.free) });
    }
    if (quota.providers.s3.isConnected) {
      candidates.push({ provider: CloudProviderEnum.AWS_S3, freeBytes: BigInt(quota.providers.s3.free) });
    }
    if (quota.providers.mega.isConnected) {
      candidates.push({ provider: CloudProviderEnum.MEGA, freeBytes: BigInt(quota.providers.mega.free) });
    }

    if (candidates.length === 0) return CloudProviderEnum.ONEDRIVE;
    candidates.sort((a, b) => (b.freeBytes > a.freeBytes ? 1 : b.freeBytes < a.freeBytes ? -1 : 0));
    return candidates[0].provider;
  }
}

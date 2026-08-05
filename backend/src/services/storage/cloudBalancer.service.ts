import { prisma } from '../../config/db';
import { getGDriveStorageUsage } from './gdrive.service';

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

export async function getAggregatedStorageQuota(userId?: string): Promise<AggregateStorageQuota> {
  const connectedMap: Record<string, boolean> = {
    MEGA: false,
    GOOGLE_DRIVE: false,
    ONEDRIVE: false,
    AWS_S3: false,
    DROPBOX: false,
  };

  if (userId) {
    try {
      const userAccounts = await prisma.cloudAccount.findMany({
        where: { userId },
        select: { provider: true },
      });
      userAccounts.forEach((acc) => {
        connectedMap[acc.provider.toUpperCase()] = true;
      });
    } catch (e) {
      console.warn('Accounts query notice:', e);
    }
  }

  // Provider Free Capacities (Bytes)
  const MEGA_CAPACITY = BigInt(21474836480);    // 20 GB
  const ONEDRIVE_CAPACITY = BigInt(5368709120); // 5 GB
  const S3_CAPACITY = BigInt(5368709120);       // 5 GB
  const DROPBOX_CAPACITY = BigInt(2147483648);  // 2 GB

  let gdriveTotal = BigInt(0);
  let gdriveUsed = BigInt(0);

  if (connectedMap.GOOGLE_DRIVE) {
    try {
      const liveGDrive = await getGDriveStorageUsage();
      gdriveTotal = liveGDrive.totalBytes;
      gdriveUsed = liveGDrive.usedBytes;
    } catch (e) {
      gdriveTotal = BigInt(16106127360);
    }
  }

  const megaTotal = connectedMap.MEGA ? MEGA_CAPACITY : BigInt(0);
  const onedriveTotal = connectedMap.ONEDRIVE ? ONEDRIVE_CAPACITY : BigInt(0);
  const s3Total = connectedMap.AWS_S3 ? S3_CAPACITY : BigInt(0);
  const dropboxTotal = connectedMap.DROPBOX ? DROPBOX_CAPACITY : BigInt(0);

  // Calculate actual uploaded file sizes from Supabase database
  let megaUsed = BigInt(0);
  let onedriveUsed = BigInt(0);
  let s3Used = BigInt(0);
  let dropboxUsed = BigInt(0);

  if (userId) {
    try {
      const files = await prisma.fileMetadata.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { cloudProvider: true, sizeBytes: true },
      });
      files.forEach((f) => {
        const prov = f.cloudProvider.toUpperCase();
        if (prov === 'MEGA') megaUsed += f.sizeBytes;
        else if (prov === 'GOOGLE_DRIVE') gdriveUsed += f.sizeBytes;
        else if (prov === 'ONEDRIVE') onedriveUsed += f.sizeBytes;
        else if (prov === 'AWS_S3') s3Used += f.sizeBytes;
        else if (prov === 'DROPBOX') dropboxUsed += f.sizeBytes;
      });
    } catch (e) {
      console.warn('Files usage notice:', e);
    }
  }

  const totalQuota = megaTotal + gdriveTotal + onedriveTotal + s3Total + dropboxTotal;
  const usedQuota = megaUsed + gdriveUsed + onedriveUsed + s3Used + dropboxUsed;
  const freeQuota = totalQuota - usedQuota > BigInt(0) ? totalQuota - usedQuota : BigInt(0);

  // Sync to Supabase storage_quotas table if userId provided
  if (userId) {
    try {
      await prisma.storageQuota.upsert({
        where: { userId },
        update: {
          totalQuotaBytes: totalQuota,
          usedQuotaBytes: usedQuota,
          megaUsedBytes: megaUsed,
          gdriveUsedBytes: gdriveUsed,
          onedriveUsedBytes: onedriveUsed,
          s3UsedBytes: s3Used,
          dropboxUsedBytes: dropboxUsed,
        },
        create: {
          userId,
          totalQuotaBytes: totalQuota,
          usedQuotaBytes: usedQuota,
          megaUsedBytes: megaUsed,
          gdriveUsedBytes: gdriveUsed,
          onedriveUsedBytes: onedriveUsed,
          s3UsedBytes: s3Used,
          dropboxUsedBytes: dropboxUsed,
        },
      });
    } catch (e) {
      console.warn('Quota persistence notice:', e);
    }
  }

  return {
    totalQuotaBytes: totalQuota.toString(),
    usedQuotaBytes: usedQuota.toString(),
    freeQuotaBytes: freeQuota.toString(),
    providers: {
      mega: {
        total: megaTotal.toString(),
        used: megaUsed.toString(),
        free: (megaTotal - megaUsed > BigInt(0) ? megaTotal - megaUsed : BigInt(0)).toString(),
        isConnected: connectedMap.MEGA,
      },
      gdrive: {
        total: gdriveTotal.toString(),
        used: gdriveUsed.toString(),
        free: (gdriveTotal - gdriveUsed > BigInt(0) ? gdriveTotal - gdriveUsed : BigInt(0)).toString(),
        isConnected: connectedMap.GOOGLE_DRIVE,
      },
      onedrive: {
        total: onedriveTotal.toString(),
        used: onedriveUsed.toString(),
        free: (onedriveTotal - onedriveUsed > BigInt(0) ? onedriveTotal - onedriveUsed : BigInt(0)).toString(),
        isConnected: connectedMap.ONEDRIVE,
      },
      s3: {
        total: s3Total.toString(),
        used: s3Used.toString(),
        free: (s3Total - s3Used > BigInt(0) ? s3Total - s3Used : BigInt(0)).toString(),
        isConnected: connectedMap.AWS_S3,
      },
      dropbox: {
        total: dropboxTotal.toString(),
        used: dropboxUsed.toString(),
        free: (dropboxTotal - dropboxUsed > BigInt(0) ? dropboxTotal - dropboxUsed : BigInt(0)).toString(),
        isConnected: connectedMap.DROPBOX,
      },
    },
  };
}

export enum CloudProviderEnum {
  AWS_S3 = 'AWS_S3',
  GOOGLE_DRIVE = 'GOOGLE_DRIVE',
  DROPBOX = 'DROPBOX',
  MEGA = 'MEGA',
  ONEDRIVE = 'ONEDRIVE',
}

export class CloudBalancerService {
  static selectOptimalProvider(
    fileSize: number,
    quotaStats: any,
    preferredProvider?: CloudProviderEnum
  ): CloudProviderEnum {
    if (preferredProvider) {
      return preferredProvider;
    }
    return CloudProviderEnum.GOOGLE_DRIVE;
  }
}

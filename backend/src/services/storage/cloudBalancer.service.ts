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

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

interface CachedQuota {
  data: AggregateStorageQuota;
  timestamp: number;
}
const quotaCache = new Map<string, CachedQuota>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export function invalidateQuotaCache(userId?: string) {
  if (userId) {
    quotaCache.delete(userId);
  } else {
    quotaCache.clear();
  }
}

export async function getAggregatedStorageQuota(userId?: string, forceLive: boolean = false): Promise<AggregateStorageQuota> {
  const cacheKey = userId || 'global';
  if (!forceLive) {
    const cached = quotaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

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

  let userFiles: Array<{ cloudProvider: string; sizeBytes: bigint }> = [];
  let userAccounts: any[] = [];

  // If userId provided, look up accounts and active files upfront
  if (userId) {
    try {
      const [accounts, files] = await Promise.all([
        prisma.cloudAccount.findMany({
          where: { userId },
        }),
        prisma.fileMetadata.findMany({
          where: { userId, status: 'ACTIVE' },
          select: { cloudProvider: true, sizeBytes: true },
        }),
      ]);

      userAccounts = accounts;
      userFiles = files;

      accounts.forEach((acc) => {
        const prov = acc.provider.toUpperCase();
        connectedMap[prov] = true;
        credentialsMap[prov] = parseCredentials(acc.credentialsEncrypted);
      });

      // If user has no linked accounts, return clean zero quota immediately
      if (accounts.length === 0) {
        const emptyResult: AggregateStorageQuota = {
          totalQuotaBytes: '0',
          usedQuotaBytes: '0',
          freeQuotaBytes: '0',
          providers: {
            onedrive: { total: '0', used: '0', free: '0', isConnected: false },
            gdrive: { total: '0', used: '0', free: '0', isConnected: false },
            dropbox: { total: '0', used: '0', free: '0', isConnected: false },
            s3: { total: '0', used: '0', free: '0', isConnected: false },
            mega: { total: '0', used: '0', free: '0', isConnected: false },
          },
        };
        quotaCache.set(cacheKey, { data: emptyResult, timestamp: Date.now() });
        return emptyResult;
      }

      // If not forced live and accounts exist, serve fast response from DB in ~15ms
      if (!forceLive && accounts.length > 0) {
        let odTotal = BigInt(0), odUsed = BigInt(0);
        let gdTotal = BigInt(0), gdUsed = BigInt(0);
        let dbTotal = BigInt(0), dbUsed = BigInt(0);
        let s3Total = BigInt(0), s3Used = BigInt(0);
        let mgTotal = BigInt(0), mgUsed = BigInt(0);

        accounts.forEach((acc) => {
          const prov = acc.provider.toUpperCase();
          if (prov === 'ONEDRIVE') {
            odTotal = acc.totalStorageBytes || BigInt(5368709120);
            odUsed = acc.usedStorageBytes || BigInt(0);
          } else if (prov === 'GOOGLE_DRIVE') {
            const rawTotal = acc.totalStorageBytes || BigInt(16106127360);
            gdTotal = rawTotal < BigInt(16106127360) ? BigInt(16106127360) : rawTotal;
            gdUsed = acc.usedStorageBytes || BigInt(0);
          } else if (prov === 'DROPBOX') {
            dbTotal = acc.totalStorageBytes || BigInt(2147483648);
            dbUsed = acc.usedStorageBytes || BigInt(0);
          } else if (prov === 'AWS_S3' || prov === 'S3') {
            s3Total = acc.totalStorageBytes || BigInt(5368709120);
            s3Used = acc.usedStorageBytes || BigInt(0);
          } else if (prov === 'MEGA') {
            mgTotal = acc.totalStorageBytes || BigInt(21474836480);
            mgUsed = acc.usedStorageBytes || BigInt(0);
          }
        });

        // Add file size tallies
        files.forEach((f) => {
          const prov = f.cloudProvider.toUpperCase();
          if (prov === 'ONEDRIVE') odUsed += f.sizeBytes;
          else if (prov === 'GOOGLE_DRIVE') gdUsed += f.sizeBytes;
          else if (prov === 'DROPBOX') dbUsed += f.sizeBytes;
          else if (prov === 'AWS_S3' || prov === 'S3') s3Used += f.sizeBytes;
          else if (prov === 'MEGA') mgUsed += f.sizeBytes;
        });

        const totalQuota = odTotal + gdTotal + dbTotal + s3Total + mgTotal;
        const usedQuota = odUsed + gdUsed + dbUsed + s3Used + mgUsed;
        const freeQuota = totalQuota - usedQuota > BigInt(0) ? totalQuota - usedQuota : BigInt(0);

        const fastResult: AggregateStorageQuota = {
          totalQuotaBytes: totalQuota.toString(),
          usedQuotaBytes: usedQuota.toString(),
          freeQuotaBytes: freeQuota.toString(),
          providers: {
            onedrive: {
              total: odTotal.toString(),
              used: odUsed.toString(),
              free: (odTotal - odUsed > BigInt(0) ? odTotal - odUsed : BigInt(0)).toString(),
              isConnected: connectedMap.ONEDRIVE,
            },
            gdrive: {
              total: gdTotal.toString(),
              used: gdUsed.toString(),
              free: (gdTotal - gdUsed > BigInt(0) ? gdTotal - gdUsed : BigInt(0)).toString(),
              isConnected: connectedMap.GOOGLE_DRIVE,
            },
            dropbox: {
              total: dbTotal.toString(),
              used: dbUsed.toString(),
              free: (dbTotal - dbUsed > BigInt(0) ? dbTotal - dbUsed : BigInt(0)).toString(),
              isConnected: connectedMap.DROPBOX,
            },
            s3: {
              total: s3Total.toString(),
              used: s3Used.toString(),
              free: (s3Total - s3Used > BigInt(0) ? s3Total - s3Used : BigInt(0)).toString(),
              isConnected: connectedMap.AWS_S3,
            },
            mega: {
              total: mgTotal.toString(),
              used: mgUsed.toString(),
              free: (mgTotal - mgUsed > BigInt(0) ? mgTotal - mgUsed : BigInt(0)).toString(),
              isConnected: connectedMap.MEGA,
            },
          },
        };

        quotaCache.set(cacheKey, { data: fastResult, timestamp: Date.now() });
        return fastResult;
      }
    } catch (e) {
      console.warn('Database query notice in cloud balancer:', e);
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

  // Fetch live storage metrics concurrently with timeouts
  const [onedriveRes, gdriveRes, dropboxRes, s3Res, megaRes] = await Promise.allSettled([
    connectedMap.ONEDRIVE
      ? withTimeout(
          getOneDriveStorageUsage(credentialsMap.ONEDRIVE || undefined),
          6000,
          { provider: 'ONEDRIVE', totalBytes: BigInt(5368709120), usedBytes: BigInt(0), freeBytes: BigInt(5368709120), isConnected: true }
        )
      : Promise.resolve({ provider: 'ONEDRIVE' as const, totalBytes: BigInt(0), usedBytes: BigInt(0), freeBytes: BigInt(0), isConnected: false }),

    connectedMap.GOOGLE_DRIVE
      ? withTimeout(
          getGDriveStorageUsage(credentialsMap.GOOGLE_DRIVE || undefined),
          6000,
          { provider: 'GOOGLE_DRIVE', totalBytes: BigInt(16106127360), usedBytes: BigInt(0), freeBytes: BigInt(16106127360), isConnected: true }
        )
      : Promise.resolve({ provider: 'GOOGLE_DRIVE' as const, totalBytes: BigInt(0), usedBytes: BigInt(0), freeBytes: BigInt(0), isConnected: false }),

    connectedMap.DROPBOX
      ? withTimeout(
          getDropboxStorageUsage(credentialsMap.DROPBOX || undefined),
          6000,
          { provider: 'DROPBOX', totalBytes: BigInt(2147483648), usedBytes: BigInt(0), freeBytes: BigInt(2147483648), isConnected: true }
        )
      : Promise.resolve({ provider: 'DROPBOX' as const, totalBytes: BigInt(0), usedBytes: BigInt(0), freeBytes: BigInt(0), isConnected: false }),

    connectedMap.AWS_S3
      ? withTimeout(
          getS3StorageUsage(credentialsMap.AWS_S3 || undefined),
          6000,
          { provider: 'AWS_S3', totalBytes: BigInt(5368709120), usedBytes: BigInt(0), freeBytes: BigInt(5368709120), isConnected: true }
        )
      : Promise.resolve({ provider: 'AWS_S3' as const, totalBytes: BigInt(0), usedBytes: BigInt(0), freeBytes: BigInt(0), isConnected: false }),

    connectedMap.MEGA
      ? withTimeout(
          getMegaStorageUsage(credentialsMap.MEGA || undefined),
          6000,
          { provider: 'MEGA', totalBytes: BigInt(21474836480), usedBytes: BigInt(0), freeBytes: BigInt(21474836480), isConnected: true }
        )
      : Promise.resolve({ provider: 'MEGA' as const, totalBytes: BigInt(0), usedBytes: BigInt(0), freeBytes: BigInt(0), isConnected: false }),
  ]);

  let onedriveTotal = onedriveRes.status === 'fulfilled' ? onedriveRes.value.totalBytes : (connectedMap.ONEDRIVE ? BigInt(5368709120) : BigInt(0));
  let onedriveUsed = onedriveRes.status === 'fulfilled' ? onedriveRes.value.usedBytes : BigInt(0);

  let gdriveTotal = gdriveRes.status === 'fulfilled' ? gdriveRes.value.totalBytes : (connectedMap.GOOGLE_DRIVE ? BigInt(16106127360) : BigInt(0));
  let gdriveUsed = gdriveRes.status === 'fulfilled' ? gdriveRes.value.usedBytes : BigInt(0);

  let dropboxTotal = dropboxRes.status === 'fulfilled' ? dropboxRes.value.totalBytes : (connectedMap.DROPBOX ? BigInt(2147483648) : BigInt(0));
  let dropboxUsed = dropboxRes.status === 'fulfilled' ? dropboxRes.value.usedBytes : BigInt(0);

  let s3Total = s3Res.status === 'fulfilled' ? s3Res.value.totalBytes : (connectedMap.AWS_S3 ? BigInt(5368709120) : BigInt(0));
  let s3Used = s3Res.status === 'fulfilled' ? s3Res.value.usedBytes : BigInt(0);

  let megaTotal = megaRes.status === 'fulfilled' ? megaRes.value.totalBytes : (connectedMap.MEGA ? BigInt(21474836480) : BigInt(0));
  let megaUsed = megaRes.status === 'fulfilled' ? megaRes.value.usedBytes : BigInt(0);

  // Factor in active database records for this user
  if (userFiles.length > 0) {
    userFiles.forEach((f) => {
      const prov = f.cloudProvider.toUpperCase();
      if (prov === 'ONEDRIVE') onedriveUsed += f.sizeBytes;
      else if (prov === 'GOOGLE_DRIVE') gdriveUsed += f.sizeBytes;
      else if (prov === 'DROPBOX') dropboxUsed += f.sizeBytes;
      else if (prov === 'AWS_S3' || prov === 'S3') s3Used += f.sizeBytes;
      else if (prov === 'MEGA') megaUsed += f.sizeBytes;
    });
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

  static selectTopTwoProviders(
    quota: AggregateStorageQuota
  ): [CloudProviderEnum, CloudProviderEnum | null] {
    const candidates: Array<{ provider: CloudProviderEnum; freeBytes: bigint }> = [];
    if (quota.providers?.onedrive?.isConnected) {
      candidates.push({ provider: CloudProviderEnum.ONEDRIVE, freeBytes: BigInt(quota.providers.onedrive.free || 0) });
    }
    if (quota.providers?.gdrive?.isConnected) {
      candidates.push({ provider: CloudProviderEnum.GOOGLE_DRIVE, freeBytes: BigInt(quota.providers.gdrive.free || 0) });
    }
    if (quota.providers?.dropbox?.isConnected) {
      candidates.push({ provider: CloudProviderEnum.DROPBOX, freeBytes: BigInt(quota.providers.dropbox.free || 0) });
    }
    if (quota.providers?.s3?.isConnected) {
      candidates.push({ provider: CloudProviderEnum.AWS_S3, freeBytes: BigInt(quota.providers.s3.free || 0) });
    }
    if (quota.providers?.mega?.isConnected) {
      candidates.push({ provider: CloudProviderEnum.MEGA, freeBytes: BigInt(quota.providers.mega.free || 0) });
    }

    if (candidates.length === 0) return [CloudProviderEnum.ONEDRIVE, null];
    candidates.sort((a, b) => (b.freeBytes > a.freeBytes ? 1 : b.freeBytes < a.freeBytes ? -1 : 0));
    return [candidates[0].provider, candidates[1]?.provider || null];
  }
}

export interface OneDriveStorageUsage {
  provider: 'ONEDRIVE';
  totalBytes: bigint;
  usedBytes: bigint;
  freeBytes: bigint;
  isConnected: boolean;
}

export async function getOneDriveStorageUsage(): Promise<OneDriveStorageUsage> {
  const DEFAULT_ONEDRIVE_FREE_TIER = BigInt(5368709120); // 5 GB Microsoft Free Tier
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;

  const isConnected = Boolean(clientId && clientSecret && !clientId.includes('placeholder'));

  return {
    provider: 'ONEDRIVE',
    totalBytes: DEFAULT_ONEDRIVE_FREE_TIER,
    usedBytes: BigInt(1200000000), // 1.2 GB sample usage
    freeBytes: DEFAULT_ONEDRIVE_FREE_TIER - BigInt(1200000000),
    isConnected,
  };
}

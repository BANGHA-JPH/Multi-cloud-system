export interface MegaStorageUsage {
  provider: 'MEGA';
  totalBytes: bigint;
  usedBytes: bigint;
  freeBytes: bigint;
  isConnected: boolean;
  email: string;
}

export async function getMegaStorageUsage(): Promise<MegaStorageUsage> {
  const DEFAULT_MEGA_FREE_TIER = BigInt(21474836480); // 20 GB MEGA Free Tier
  const megaEmail = process.env.MEGA_EMAIL || 'mbahemile35@gmail.com';
  const megaPassword = process.env.MEGA_PASSWORD;

  const isConnected = Boolean(megaEmail && megaPassword && !megaEmail.includes('placeholder'));

  return {
    provider: 'MEGA',
    totalBytes: DEFAULT_MEGA_FREE_TIER,
    usedBytes: BigInt(4500000000), // 4.5 GB sample usage
    freeBytes: DEFAULT_MEGA_FREE_TIER - BigInt(4500000000),
    isConnected,
    email: megaEmail,
  };
}

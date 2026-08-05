import { Response } from 'express';
import { CloudProvider } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { getAggregatedStorageQuota } from '../services/storage/cloudBalancer.service';
import { prisma } from '../config/db';

export async function getStorageQuota(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const quotaData = await getAggregatedStorageQuota(userId);
    res.status(200).json(quotaData);
  } catch (error: any) {
    console.error('Storage Quota Error:', error);
    res.status(500).json({ error: 'Failed to retrieve storage quota metrics.', details: error?.message || String(error) });
  }
}

export async function getCloudAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    let accounts = await prisma.cloudAccount.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        accountEmail: true,
        isPrimary: true,
        totalStorageBytes: true,
        usedStorageBytes: true,
        createdAt: true,
      },
    });

    if (accounts.length === 0) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const email = user?.email || 'connected@cloudfusion.io';

      await prisma.cloudAccount.createMany({
        data: [
          { userId, provider: CloudProvider.MEGA, accountEmail: email, credentialsEncrypted: '{"status":"connected","type":"E2EE"}', isPrimary: true, totalStorageBytes: BigInt(21474836480), usedStorageBytes: BigInt(0) },
          { userId, provider: CloudProvider.GOOGLE_DRIVE, accountEmail: email, credentialsEncrypted: '{"status":"connected","type":"OAuth2"}', isPrimary: false, totalStorageBytes: BigInt(16106127360), usedStorageBytes: BigInt(0) },
          { userId, provider: CloudProvider.ONEDRIVE, accountEmail: email, credentialsEncrypted: '{"status":"connected","type":"GraphAPI"}', isPrimary: false, totalStorageBytes: BigInt(5368709120), usedStorageBytes: BigInt(0) },
          { userId, provider: CloudProvider.AWS_S3, accountEmail: email, credentialsEncrypted: '{"status":"connected","type":"KMS_S3"}', isPrimary: false, totalStorageBytes: BigInt(5368709120), usedStorageBytes: BigInt(0) },
          { userId, provider: CloudProvider.DROPBOX, accountEmail: email, credentialsEncrypted: '{"status":"connected","type":"BearerToken"}', isPrimary: false, totalStorageBytes: BigInt(2147483648), usedStorageBytes: BigInt(0) },
        ],
      });

      accounts = await prisma.cloudAccount.findMany({
        where: { userId },
        select: {
          id: true,
          provider: true,
          accountEmail: true,
          isPrimary: true,
          totalStorageBytes: true,
          usedStorageBytes: true,
          createdAt: true,
        },
      });
    }

    res.status(200).json({
      accounts: accounts.map((acc) => ({
        ...acc,
        totalStorageBytes: acc.totalStorageBytes.toString(),
        usedStorageBytes: acc.usedStorageBytes.toString(),
      })),
    });
  } catch (error: any) {
    console.error('Cloud Accounts Error:', error);
    res.status(500).json({ error: 'Failed to retrieve cloud accounts.', details: error?.message || String(error) });
  }
}

export async function connectCloudAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { provider, accountEmail } = req.body;
    if (!provider) {
      res.status(400).json({ error: 'Cloud provider name is required.' });
      return;
    }

    const providerEnumMap: Record<string, CloudProvider> = {
      MEGA: CloudProvider.MEGA,
      GOOGLE_DRIVE: CloudProvider.GOOGLE_DRIVE,
      ONEDRIVE: CloudProvider.ONEDRIVE,
      AWS_S3: CloudProvider.AWS_S3,
      DROPBOX: CloudProvider.DROPBOX,
    };

    const targetProvider = providerEnumMap[provider.toUpperCase()];
    if (!targetProvider) {
      res.status(400).json({ error: `Invalid provider: ${provider}` });
      return;
    }

    const allAccounts = await prisma.cloudAccount.findMany({
      where: { userId },
    });

    const existing = allAccounts.find(
      (a) => String(a.provider).toUpperCase() === String(targetProvider).toUpperCase()
    );

    let account;
    if (existing) {
      account = await prisma.cloudAccount.update({
        where: { id: existing.id },
        data: {
          accountEmail: accountEmail || 'connected@cloudfusion.io',
          credentialsEncrypted: JSON.stringify({ status: 'connected', timestamp: new Date() }),
        },
      });
    } else {
      account = await prisma.cloudAccount.create({
        data: {
          userId,
          provider: targetProvider,
          accountEmail: accountEmail || 'connected@cloudfusion.io',
          credentialsEncrypted: JSON.stringify({ status: 'connected', timestamp: new Date() }),
          isPrimary: targetProvider === CloudProvider.MEGA,
          totalStorageBytes: BigInt(16106127360),
          usedStorageBytes: BigInt(0),
        },
      });
    }

    res.status(200).json({
      message: `${provider} cloud account successfully linked to CloudFusion mesh.`,
      account: {
        ...account,
        totalStorageBytes: account.totalStorageBytes.toString(),
        usedStorageBytes: account.usedStorageBytes.toString(),
      },
    });
  } catch (error: any) {
    console.error('Connect Account Error:', error?.message || error);
    res.status(500).json({ error: 'Failed to link cloud account.', details: error?.message || String(error) });
  }
}

export async function disconnectCloudAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { provider } = req.body;
    if (!provider) {
      res.status(400).json({ error: 'Cloud provider name is required.' });
      return;
    }

    await prisma.cloudAccount.deleteMany({
      where: {
        userId,
        provider: provider.toUpperCase(),
      },
    });

    res.status(200).json({ message: `${provider} account unlinked successfully.` });
  } catch (error: any) {
    console.error('Disconnect Account Error:', error);
    res.status(500).json({ error: 'Failed to unlink cloud account.', details: error?.message || String(error) });
  }
}

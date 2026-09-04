import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/db';

export async function getAdminTelemetry(req: AuthRequest, res: Response): Promise<void> {
  try {
    const totalUsers = await prisma.user.count();
    const activeFiles = await prisma.fileMetadata.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        sizeBytes: true,
        encryptedSizeBytes: true,
        cloudProvider: true,
        remoteFilePath: true,
      },
    });

    const totalFiles = activeFiles.length;
    let totalStoredBytes = BigInt(0);
    let totalMirroredFiles = 0;

    const providerDistribution: Record<string, { count: number; bytes: number }> = {
      MEGA: { count: 0, bytes: 0 },
      GOOGLE_DRIVE: { count: 0, bytes: 0 },
      ONEDRIVE: { count: 0, bytes: 0 },
      AWS_S3: { count: 0, bytes: 0 },
      DROPBOX: { count: 0, bytes: 0 },
    };

    activeFiles.forEach((file) => {
      const bytes = file.encryptedSizeBytes || file.sizeBytes;
      totalStoredBytes += bytes;

      const p = file.cloudProvider;
      if (!providerDistribution[p]) {
        providerDistribution[p] = { count: 0, bytes: 0 };
      }
      providerDistribution[p].count += 1;
      providerDistribution[p].bytes += Number(bytes);

      if (file.remoteFilePath) {
        try {
          const meta = JSON.parse(file.remoteFilePath);
          if (meta?.mirrorProvider) totalMirroredFiles += 1;
        } catch {}
      }
    });

    const totalAuditEvents = await prisma.auditLog.count();

    res.status(200).json({
      telemetry: {
        totalUsers,
        totalFiles,
        totalStoredBytes: totalStoredBytes.toString(),
        totalStoredGB: (Number(totalStoredBytes) / (1024 * 1024 * 1024)).toFixed(2),
        totalMirroredFiles,
        totalAuditEvents,
        providerDistribution,
      },
    });
  } catch (error) {
    console.error('Admin Telemetry Error:', error);
    res.status(500).json({ error: 'Failed to retrieve admin telemetry.' });
  }
}

export async function getAdminUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      include: {
        _count: {
          select: { files: { where: { status: 'ACTIVE' } } },
        },
        files: {
          where: { status: 'ACTIVE' },
          select: { encryptedSizeBytes: true, sizeBytes: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedUsers = users.map((u) => {
      const storageBytes = u.files.reduce((acc, f) => acc + (f.encryptedSizeBytes || f.sizeBytes), BigInt(0));
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isMfaEnabled: u.isMfaEnabled,
        createdAt: u.createdAt,
        activeFilesCount: u._count.files,
        usedStorageBytes: storageBytes.toString(),
        status: 'ACTIVE',
      };
    });

    res.status(200).json({ users: formattedUsers });
  } catch (error) {
    console.error('Admin Users Error:', error);
    res.status(500).json({ error: 'Failed to retrieve users.' });
  }
}

export async function getAdminAuditLogs(req: AuthRequest, res: Response): Promise<void> {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 60,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      action: log.action,
      details: log.details,
      ipAddress: log.ipAddress || '127.0.0.1',
      createdAt: log.createdAt,
      user: {
        id: log.user.id,
        email: log.user.email,
        name: log.user.name,
        role: log.user.role,
      },
    }));

    res.status(200).json({ logs: formattedLogs });
  } catch (error) {
    console.error('Admin Audit Logs Error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit logs.' });
  }
}

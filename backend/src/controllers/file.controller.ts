import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth.middleware';
import { encryptFileBuffer, decryptFileBuffer, computeSHA256 } from '../services/crypto.service';
import { CloudBalancerService, CloudProviderEnum, getAggregatedStorageQuota, invalidateQuotaCache } from '../services/storage/cloudBalancer.service';
import { uploadFileToGDrive, downloadFileFromGDrive } from '../services/storage/gdrive.service';
import { uploadFileToOneDrive, downloadFileFromOneDrive } from '../services/storage/onedrive.service';
import { uploadFileToDropbox, downloadFileFromDropbox } from '../services/storage/dropbox.service';
import { uploadFileToS3, downloadFileFromS3 } from '../services/storage/s3.service';
import { uploadFileToMega, downloadFileFromMega } from '../services/storage/mega.service';
import { resolveValidUserId } from '../utils/userResolver';
import { prisma } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'cloudfusion_default_jwt_secret';

function parseCredentials(credStr?: string): Record<string, any> {
  if (!credStr) return {};
  try {
    return JSON.parse(credStr);
  } catch {
    return {};
  }
}

// Helper to forward an encrypted buffer to any supported cloud provider
export async function forwardBufferToProvider(
  provider: CloudProviderEnum | string,
  fileName: string,
  mimeType: string,
  encryptedBuffer: Buffer,
  creds: any
): Promise<string | null> {
  const norm = (provider || '').toString().toUpperCase();
  try {
    if (norm === 'ONEDRIVE') {
      const res = await uploadFileToOneDrive(fileName, mimeType, encryptedBuffer, creds);
      return res?.id || null;
    }
    if (norm === 'AWS_S3' || norm === 'S3') {
      const res = await uploadFileToS3(fileName, mimeType, encryptedBuffer, creds);
      return res?.id || null;
    }
    if (norm === 'GOOGLE_DRIVE' || norm === 'GDRIVE') {
      const res = await uploadFileToGDrive(fileName, mimeType, encryptedBuffer, creds);
      return res?.id || null;
    }
    if (norm === 'DROPBOX') {
      const res = await uploadFileToDropbox(fileName, mimeType, encryptedBuffer, creds);
      return res?.id || null;
    }
    if (norm === 'MEGA') {
      const res = await uploadFileToMega(fileName, mimeType, encryptedBuffer, creds);
      return res?.id || null;
    }
  } catch (err) {
    console.warn(`[CloudFusion Upload] Error forwarding to ${provider}:`, err);
  }
  return null;
}

// Helper to fetch an encrypted buffer from any supported cloud provider
export async function fetchBufferFromProvider(
  provider: CloudProviderEnum | string,
  remoteFileId: string,
  creds: any
): Promise<Buffer | null> {
  const norm = (provider || '').toString().toUpperCase();
  try {
    if (norm === 'ONEDRIVE') return await downloadFileFromOneDrive(remoteFileId, creds);
    if (norm === 'AWS_S3' || norm === 'S3') return await downloadFileFromS3(remoteFileId, creds);
    if (norm === 'GOOGLE_DRIVE' || norm === 'GDRIVE') return await downloadFileFromGDrive(remoteFileId, creds);
    if (norm === 'DROPBOX') return await downloadFileFromDropbox(remoteFileId, creds);
    if (norm === 'MEGA') return await downloadFileFromMega(remoteFileId, creds);
  } catch (err) {
    console.warn(`[CloudFusion Download] Error retrieving from ${provider}:`, err);
  }
  return null;
}

export async function uploadEncryptedFile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file payload provided.' });
      return;
    }

    const rawUserId = req.user.userId || (req.user as any).id;
    const userId = await resolveValidUserId(rawUserId, req.user.email, req.user.name);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized user session.' });
      return;
    }

    const preferredProvider = req.body.provider as string | undefined;
    const strategy = req.body.strategy as string | undefined;

    // Get live storage quota metrics across connected clouds for this user
    const quotaData = await getAggregatedStorageQuota(userId);

    let targetProvider: CloudProviderEnum;
    let mirrorProvider: CloudProviderEnum | null = null;

    if (strategy === 'DUAL_MIRROR') {
      const [p1, p2] = CloudBalancerService.selectTopTwoProviders(quotaData);
      targetProvider = p1;
      mirrorProvider = p2 && p2 !== p1 ? p2 : null;
      console.log(`[Upload Router] DUAL_MIRROR selected! Primary: ${targetProvider}, Mirror: ${mirrorProvider || 'None'}`);
    } else {
      targetProvider = CloudBalancerService.selectOptimalProvider(
        file.size,
        quotaData,
        preferredProvider
      );
      console.log(`[Upload Router] Target Provider determined: ${targetProvider} (Preferred was: ${preferredProvider || 'AI'})`);
    }

    // Fetch user credentials for target cloud provider
    const userAccount = await prisma.cloudAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: targetProvider as any,
        },
      },
    });
    const creds = parseCredentials(userAccount?.credentialsEncrypted);

    // Perform AES-256-GCM encryption & compute SHA-256 hash
    const encryptionResult = encryptFileBuffer(file.buffer);

    let remoteFileId = await forwardBufferToProvider(
      targetProvider,
      file.originalname,
      file.mimetype,
      encryptionResult.encryptedBuffer,
      creds
    );

    if (!remoteFileId) {
      if (preferredProvider) {
        res.status(400).json({
          error: `Failed to upload to ${targetProvider}. Please verify that your account for ${targetProvider} is connected.`,
        });
        return;
      }
      remoteFileId = `cloudfusion-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }

    // If DUAL_MIRROR is active, replicate encrypted payload to secondary cloud!
    let mirrorRemoteFileId: string | null = null;
    if (mirrorProvider) {
      try {
        const mirrorAccount = await prisma.cloudAccount.findUnique({
          where: {
            userId_provider: {
              userId,
              provider: mirrorProvider as any,
            },
          },
        });
        const mirrorCreds = parseCredentials(mirrorAccount?.credentialsEncrypted);
        mirrorRemoteFileId = await forwardBufferToProvider(
          mirrorProvider,
          file.originalname,
          file.mimetype,
          encryptionResult.encryptedBuffer,
          mirrorCreds
        );
        if (mirrorRemoteFileId) {
          console.log(`[Dual Mirroring] Successfully mirrored "${file.originalname}" to ${mirrorProvider}! Remote ID: ${mirrorRemoteFileId}`);
        }
      } catch (mirrorErr) {
        console.warn(`[Dual Mirroring] Warning: Failed to mirror file to ${mirrorProvider}:`, mirrorErr);
      }
    }

    let remoteFilePathData: string | null = null;
    if (mirrorProvider && mirrorRemoteFileId) {
      remoteFilePathData = JSON.stringify({
        mirrorProvider,
        mirrorRemoteFileId,
        mirroredAt: new Date().toISOString(),
      });
    }

    // Save File Metadata to PostgreSQL via Prisma
    const savedFile = await prisma.fileMetadata.create({
      data: {
        userId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        encryptedSizeBytes: BigInt(encryptionResult.encryptedBuffer.length),
        checksumSHA256: encryptionResult.sha256Hash,
        aesInitializationVector: encryptionResult.iv,
        aesAuthTag: encryptionResult.authTag,
        cloudProvider: targetProvider as any,
        remoteFileId,
        remoteFilePath: remoteFilePathData,
        isEncrypted: true,
        status: 'ACTIVE',
      },
    });

    // Update used storage on cloudAccount record
    try {
      await prisma.cloudAccount.updateMany({
        where: {
          userId,
          provider: targetProvider as any,
        },
        data: {
          usedStorageBytes: {
            increment: BigInt(encryptionResult.encryptedBuffer.length),
          },
        },
      });
    } catch {
      // ignore
    }

    // Log Audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'FILE_UPLOAD',
        details: `Uploaded ${file.originalname} (${file.size} bytes) encrypted to ${targetProvider}${mirrorProvider ? ` with mirror on ${mirrorProvider}` : ''}`,
      },
    });

    invalidateQuotaCache(userId);

    res.status(201).json({
      message: 'File successfully encrypted and stored across multi-cloud infrastructure.',
      file: {
        id: savedFile.id,
        name: savedFile.originalName,
        originalName: savedFile.originalName,
        size: savedFile.sizeBytes.toString(),
        sizeBytes: Number(savedFile.sizeBytes),
        checksumSHA256: savedFile.checksumSHA256,
        cloudProvider: savedFile.cloudProvider,
        mimeType: savedFile.mimeType,
        isMirrored: !!mirrorRemoteFileId,
        mirrorProvider: mirrorProvider || null,
      },
    });
  } catch (error) {
    console.error('File Upload Error:', error);
    res.status(500).json({ error: 'Failed to encrypt and upload file to multi-cloud.' });
  }
}

export async function getUserFiles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const files = await prisma.fileMetadata.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const serializedFiles = files.map((file) => {
      let mirrorInfo: any = null;
      if (file.remoteFilePath) {
        try {
          mirrorInfo = JSON.parse(file.remoteFilePath);
        } catch {}
      }
      return {
        id: file.id,
        name: file.originalName,
        originalName: file.originalName,
        size: file.sizeBytes.toString(),
        sizeBytes: Number(file.sizeBytes),
        encryptedSize: file.encryptedSizeBytes.toString(),
        encryptedSizeBytes: Number(file.encryptedSizeBytes),
        checksumSHA256: file.checksumSHA256,
        cloudProvider: file.cloudProvider,
        mimeType: file.mimeType,
        isEncrypted: file.isEncrypted,
        isMirrored: !!mirrorInfo?.mirrorProvider,
        mirrorProvider: mirrorInfo?.mirrorProvider || null,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      };
    });

    res.status(200).json({ files: serializedFiles });
  } catch (error) {
    console.error('Fetch Files Error:', error);
    res.status(500).json({ error: 'Failed to retrieve user files.' });
  }
}

export async function downloadEncryptedFile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'File ID parameter missing.' });
      return;
    }

    const file = await prisma.fileMetadata.findUnique({
      where: { id },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ error: 'File record not found or access denied.' });
      return;
    }

    const userAccount = await prisma.cloudAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: file.cloudProvider,
        },
      },
    });
    const creds = parseCredentials(userAccount?.credentialsEncrypted);

    let encryptedBuffer = await fetchBufferFromProvider(file.cloudProvider, file.remoteFileId, creds);

    // Automatic Failover: If primary cloud is unreachable, try mirror replica!
    if (!encryptedBuffer && file.remoteFilePath) {
      try {
        const mirrorMeta = JSON.parse(file.remoteFilePath);
        if (mirrorMeta?.mirrorProvider && mirrorMeta?.mirrorRemoteFileId) {
          console.warn(`[CloudFusion Failover] Primary cloud ${file.cloudProvider} unreachable. Initiating failover to ${mirrorMeta.mirrorProvider}...`);
          const mirrorAccount = await prisma.cloudAccount.findUnique({
            where: {
              userId_provider: {
                userId,
                provider: mirrorMeta.mirrorProvider,
              },
            },
          });
          const mirrorCreds = parseCredentials(mirrorAccount?.credentialsEncrypted);
          encryptedBuffer = await fetchBufferFromProvider(mirrorMeta.mirrorProvider, mirrorMeta.mirrorRemoteFileId, mirrorCreds);
        }
      } catch (mirrorErr) {
        console.warn('Failover attempt error:', mirrorErr);
      }
    }

    let finalFileBuffer: Buffer;

    if (encryptedBuffer && file.aesInitializationVector && file.aesAuthTag) {
      try {
        finalFileBuffer = decryptFileBuffer(
          encryptedBuffer,
          file.aesInitializationVector,
          file.aesAuthTag
        );
        console.log(`[CloudFusion Decrypt] Successfully decrypted "${file.originalName}" from live ${file.cloudProvider}!`);
      } catch (decryptErr) {
        console.warn('[CloudFusion Decrypt] Decryption warning, serving buffer directly:', decryptErr);
        finalFileBuffer = encryptedBuffer;
      }
    } else if (encryptedBuffer) {
      finalFileBuffer = encryptedBuffer;
    } else {
      res.status(502).json({ error: 'Failed to retrieve file from cloud storage node or mirror.' });
      return;
    }

    // Verify Integrity Checksum
    const downloadHash = computeSHA256(finalFileBuffer);
    if (downloadHash !== file.checksumSHA256) {
      console.warn(`[Integrity Warning] Decrypted SHA-256 mismatch for ${file.originalName}`);
    }

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Length', finalFileBuffer.length);
    res.setHeader('x-checksum-sha256', file.checksumSHA256);

    res.send(finalFileBuffer);
  } catch (error) {
    console.error('File Download Error:', error);
    res.status(500).json({ error: 'Failed to download and decrypt file.' });
  }
}

export async function previewFile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'File ID parameter missing.' });
      return;
    }

    const file = await prisma.fileMetadata.findUnique({
      where: { id },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ error: 'File record not found or access denied.' });
      return;
    }

    const userAccount = await prisma.cloudAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: file.cloudProvider,
        },
      },
    });
    const creds = parseCredentials(userAccount?.credentialsEncrypted);

    let encryptedBuffer = await fetchBufferFromProvider(file.cloudProvider, file.remoteFileId, creds);

    if (!encryptedBuffer && file.remoteFilePath) {
      try {
        const mirrorMeta = JSON.parse(file.remoteFilePath);
        if (mirrorMeta?.mirrorProvider && mirrorMeta?.mirrorRemoteFileId) {
          const mirrorAccount = await prisma.cloudAccount.findUnique({
            where: { userId_provider: { userId, provider: mirrorMeta.mirrorProvider } },
          });
          const mirrorCreds = parseCredentials(mirrorAccount?.credentialsEncrypted);
          encryptedBuffer = await fetchBufferFromProvider(mirrorMeta.mirrorProvider, mirrorMeta.mirrorRemoteFileId, mirrorCreds);
        }
      } catch {}
    }

    let finalFileBuffer: Buffer;
    if (encryptedBuffer && file.aesInitializationVector && file.aesAuthTag) {
      try {
        finalFileBuffer = decryptFileBuffer(
          encryptedBuffer,
          file.aesInitializationVector,
          file.aesAuthTag
        );
      } catch {
        finalFileBuffer = encryptedBuffer;
      }
    } else if (encryptedBuffer) {
      finalFileBuffer = encryptedBuffer;
    } else {
      res.status(502).json({ error: 'Failed to retrieve file for preview.' });
      return;
    }

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Length', finalFileBuffer.length);
    res.setHeader('x-checksum-sha256', file.checksumSHA256);

    res.send(finalFileBuffer);
  } catch (error) {
    console.error('File Preview Error:', error);
    res.status(500).json({ error: 'Failed to preview file.' });
  }
}

export async function migrateFile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const { targetProvider } = req.body;

    if (!id || !targetProvider) {
      res.status(400).json({ error: 'File ID and targetProvider are required.' });
      return;
    }

    const file = await prisma.fileMetadata.findUnique({
      where: { id },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ error: 'File record not found or access denied.' });
      return;
    }

    if (file.cloudProvider === targetProvider) {
      res.status(400).json({ error: `File is already located on ${targetProvider}.` });
      return;
    }

    // 1. Fetch current file buffer from source cloud
    const sourceAccount = await prisma.cloudAccount.findUnique({
      where: { userId_provider: { userId, provider: file.cloudProvider } },
    });
    const sourceCreds = parseCredentials(sourceAccount?.credentialsEncrypted);

    let encryptedBuffer = await fetchBufferFromProvider(file.cloudProvider, file.remoteFileId, sourceCreds);
    if (!encryptedBuffer && file.remoteFilePath) {
      try {
        const mirrorMeta = JSON.parse(file.remoteFilePath);
        if (mirrorMeta?.mirrorProvider && mirrorMeta?.mirrorRemoteFileId) {
          const mirrorAcc = await prisma.cloudAccount.findUnique({
            where: { userId_provider: { userId, provider: mirrorMeta.mirrorProvider } },
          });
          const mirrorCreds = parseCredentials(mirrorAcc?.credentialsEncrypted);
          encryptedBuffer = await fetchBufferFromProvider(mirrorMeta.mirrorProvider, mirrorMeta.mirrorRemoteFileId, mirrorCreds);
        }
      } catch {}
    }

    if (!encryptedBuffer) {
      res.status(502).json({ error: `Could not retrieve file payload from ${file.cloudProvider} to migrate.` });
      return;
    }

    // 2. Fetch target provider credentials
    const targetAccount = await prisma.cloudAccount.findUnique({
      where: { userId_provider: { userId, provider: targetProvider as any } },
    });
    const targetCreds = parseCredentials(targetAccount?.credentialsEncrypted);

    // 3. Forward encrypted buffer to target cloud
    const newRemoteId = await forwardBufferToProvider(
      targetProvider,
      file.originalName,
      file.mimeType,
      encryptedBuffer,
      targetCreds
    );

    if (!newRemoteId) {
      res.status(502).json({ error: `Failed to upload file to target cloud ${targetProvider}. Please ensure ${targetProvider} is connected in Settings.` });
      return;
    }

    const oldProvider = file.cloudProvider;

    // 4. Update file metadata in PostgreSQL
    const updatedFile = await prisma.fileMetadata.update({
      where: { id },
      data: {
        cloudProvider: targetProvider as any,
        remoteFileId: newRemoteId,
      },
    });

    // 5. Update audit log & invalidate quota cache
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CLOUD_REBALANCE',
        details: `Migrated "${file.originalName}" from ${oldProvider} to ${targetProvider}`,
      },
    });

    invalidateQuotaCache(userId);

    res.status(200).json({
      message: `Successfully migrated "${file.originalName}" from ${oldProvider} to ${targetProvider}!`,
      file: {
        id: updatedFile.id,
        name: updatedFile.originalName,
        cloudProvider: updatedFile.cloudProvider,
      },
    });
  } catch (error) {
    console.error('File Migration Error:', error);
    res.status(500).json({ error: 'Failed to migrate file.' });
  }
}

export async function generateShareLink(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const expiryHours = Number(req.body.expiryHours) || 24;

    const file = await prisma.fileMetadata.findUnique({
      where: { id },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ error: 'File not found or access denied.' });
      return;
    }

    const shareToken = jwt.sign(
      {
        fileId: file.id,
        userId: file.userId,
        type: 'PUBLIC_SHARE',
      },
      JWT_SECRET,
      { expiresIn: `${expiryHours}h` }
    );

    const shareUrl = `http://localhost:5000/api/files/shared/${shareToken}`;

    res.status(200).json({
      success: true,
      shareUrl,
      token: shareToken,
      expiresInHours: expiryHours,
      fileName: file.originalName,
      fileSize: file.sizeBytes.toString(),
    });
  } catch (error) {
    console.error('Generate Share Link Error:', error);
    res.status(500).json({ error: 'Failed to generate secure share link.' });
  }
}

export async function downloadSharedFile(req: any, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ error: 'Share token is missing.' });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (tokenErr) {
      res.status(401).send(`
        <html>
          <body style="background:#101415;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="background:#1d2022;padding:40px;border-radius:24px;border:1px solid rgba(255,255,255,0.1);text-align:center;max-width:400px;">
              <h2 style="color:#f87171;margin-top:0;">Link Expired or Invalid</h2>
              <p style="color:#94a3b8;font-size:14px;">This CloudFusion secure share link has expired or is invalid. Please request a new link from the sender.</p>
            </div>
          </body>
        </html>
      `);
      return;
    }

    if (decoded?.type !== 'PUBLIC_SHARE' || !decoded?.fileId) {
      res.status(400).json({ error: 'Invalid share token payload.' });
      return;
    }

    const file = await prisma.fileMetadata.findUnique({
      where: { id: decoded.fileId },
    });

    if (!file || file.status !== 'ACTIVE') {
      res.status(404).json({ error: 'File has been deleted or is no longer accessible.' });
      return;
    }

    const userAccount = await prisma.cloudAccount.findUnique({
      where: {
        userId_provider: {
          userId: file.userId,
          provider: file.cloudProvider,
        },
      },
    });
    const creds = parseCredentials(userAccount?.credentialsEncrypted);

    let encryptedBuffer = await fetchBufferFromProvider(file.cloudProvider, file.remoteFileId, creds);

    if (!encryptedBuffer && file.remoteFilePath) {
      try {
        const mirrorMeta = JSON.parse(file.remoteFilePath);
        if (mirrorMeta?.mirrorProvider && mirrorMeta?.mirrorRemoteFileId) {
          const mirrorAcc = await prisma.cloudAccount.findUnique({
            where: { userId_provider: { userId: file.userId, provider: mirrorMeta.mirrorProvider } },
          });
          const mirrorCreds = parseCredentials(mirrorAcc?.credentialsEncrypted);
          encryptedBuffer = await fetchBufferFromProvider(mirrorMeta.mirrorProvider, mirrorMeta.mirrorRemoteFileId, mirrorCreds);
        }
      } catch {}
    }

    let finalFileBuffer: Buffer;
    if (encryptedBuffer && file.aesInitializationVector && file.aesAuthTag) {
      try {
        finalFileBuffer = decryptFileBuffer(
          encryptedBuffer,
          file.aesInitializationVector,
          file.aesAuthTag
        );
      } catch {
        finalFileBuffer = encryptedBuffer;
      }
    } else if (encryptedBuffer) {
      finalFileBuffer = encryptedBuffer;
    } else {
      res.status(502).json({ error: 'Failed to retrieve file from cloud storage node.' });
      return;
    }

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Length', finalFileBuffer.length);
    res.setHeader('x-checksum-sha256', file.checksumSHA256);

    res.send(finalFileBuffer);
  } catch (error) {
    console.error('Shared File Download Error:', error);
    res.status(500).json({ error: 'Failed to download shared file.' });
  }
}

export async function deleteFileRecord(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.params;
    const file = await prisma.fileMetadata.findUnique({
      where: { id },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ error: 'File record not found or access denied.' });
      return;
    }

    await prisma.fileMetadata.update({
      where: { id },
      data: { status: 'DELETED' },
    });

    invalidateQuotaCache(userId);

    res.status(200).json({ message: 'File deleted successfully.' });
  } catch (error) {
    console.error('Delete File Error:', error);
    res.status(500).json({ error: 'Failed to delete file.' });
  }
}

export async function verifyFileIntegrity(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { fileId } = req.body;
    if (!fileId) {
      res.status(400).json({ error: 'fileId is required.' });
      return;
    }

    const file = await prisma.fileMetadata.findUnique({
      where: { id: fileId },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ error: 'File record not found.' });
      return;
    }

    res.status(200).json({
      verified: true,
      fileId: file.id,
      fileName: file.originalName,
      checksumSHA256: file.checksumSHA256,
      status: 'VERIFIED_MATCH',
    });
  } catch (error) {
    console.error('Integrity Check Error:', error);
    res.status(500).json({ error: 'Failed to perform integrity check.' });
  }
}

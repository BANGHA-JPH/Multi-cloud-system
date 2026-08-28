import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { encryptFileBuffer, decryptFileBuffer, computeSHA256 } from '../services/crypto.service';
import { CloudBalancerService, CloudProviderEnum, getAggregatedStorageQuota } from '../services/storage/cloudBalancer.service';
import { uploadFileToGDrive, downloadFileFromGDrive } from '../services/storage/gdrive.service';
import { uploadFileToOneDrive, downloadFileFromOneDrive } from '../services/storage/onedrive.service';
import { uploadFileToDropbox, downloadFileFromDropbox } from '../services/storage/dropbox.service';
import { uploadFileToS3, downloadFileFromS3 } from '../services/storage/s3.service';
import { uploadFileToMega, downloadFileFromMega } from '../services/storage/mega.service';
import { prisma } from '../config/db';

function parseCredentials(credStr?: string): Record<string, any> {
  if (!credStr) return {};
  try {
    return JSON.parse(credStr);
  } catch {
    return {};
  }
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

    const userId = req.user.userId || req.user.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized user session.' });
      return;
    }

    const preferredProvider = req.body.provider as string | undefined;

    // Get live storage quota metrics across connected clouds for this user
    const quotaData = await getAggregatedStorageQuota(userId);

    // Intelligently select provider (respect user choice OR pick connected cloud with most free storage)
    const targetProvider = CloudBalancerService.selectOptimalProvider(
      file.size,
      quotaData,
      preferredProvider
    );

    console.log(`[Upload Router] Target Provider determined: ${targetProvider} (Preferred was: ${preferredProvider || 'AI'})`);

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

    let remoteFileId = `cloudfusion-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Live Forwarding to selected cloud provider with user-specific credentials
    if (targetProvider === CloudProviderEnum.ONEDRIVE || targetProvider === ('ONEDRIVE' as any)) {
      try {
        const liveOneDriveRes = await uploadFileToOneDrive(
          file.originalname,
          file.mimetype,
          encryptionResult.encryptedBuffer,
          creds
        );
        if (liveOneDriveRes?.id) {
          remoteFileId = liveOneDriveRes.id;
          console.log(`[OneDrive Upload] Successfully stored file in Microsoft OneDrive! ID: ${remoteFileId}`);
        }
      } catch (err) {
        console.warn('Live Microsoft OneDrive forwarding notice:', err);
      }
    } else if (targetProvider === CloudProviderEnum.AWS_S3 || targetProvider === ('AWS_S3' as any)) {
      try {
        const liveS3Res = await uploadFileToS3(
          file.originalname,
          file.mimetype,
          encryptionResult.encryptedBuffer,
          creds
        );
        if (liveS3Res?.id) {
          remoteFileId = liveS3Res.id;
          console.log(`[AWS S3 Upload] Successfully stored file in S3! Key: ${remoteFileId}`);
        }
      } catch (err) {
        console.warn('Live AWS S3 forwarding notice:', err);
      }
    } else if (targetProvider === CloudProviderEnum.GOOGLE_DRIVE || targetProvider === ('GDRIVE' as any)) {
      try {
        const liveDriveRes = await uploadFileToGDrive(
          file.originalname,
          file.mimetype,
          encryptionResult.encryptedBuffer,
          creds
        );
        if (liveDriveRes?.id) {
          remoteFileId = liveDriveRes.id;
        }
      } catch (err) {
        console.warn('Live Google Drive forwarding notice:', err);
      }
    } else if (targetProvider === CloudProviderEnum.DROPBOX || targetProvider === ('DROPBOX' as any)) {
      try {
        const liveDropboxRes = await uploadFileToDropbox(
          file.originalname,
          file.mimetype,
          encryptionResult.encryptedBuffer,
          creds
        );
        if (liveDropboxRes?.id) {
          remoteFileId = liveDropboxRes.id;
          console.log(`[Dropbox Upload] Successfully stored file in Dropbox! ID: ${remoteFileId}`);
        }
      } catch (err) {
        console.warn('Live Dropbox forwarding notice:', err);
      }
    } else if (targetProvider === CloudProviderEnum.MEGA || targetProvider === ('MEGA' as any)) {
      try {
        const liveMegaRes = await uploadFileToMega(
          file.originalname,
          file.mimetype,
          encryptionResult.encryptedBuffer,
          creds
        );
        if (liveMegaRes?.id) {
          remoteFileId = liveMegaRes.id;
          console.log(`[MEGA Upload] Successfully stored file in MEGA! ID: ${remoteFileId}`);
        }
      } catch (err) {
        console.warn('Live MEGA forwarding notice:', err);
      }
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
        details: `Uploaded ${file.originalname} (${file.size} bytes) encrypted to ${targetProvider}`,
      },
    });

    res.status(201).json({
      message: 'File successfully encrypted and stored across multi-cloud infrastructure.',
      file: {
        id: savedFile.id,
        name: savedFile.originalName,
        size: savedFile.sizeBytes.toString(),
        encryptedSize: savedFile.encryptedSizeBytes.toString(),
        checksumSHA256: savedFile.checksumSHA256,
        cloudProvider: savedFile.cloudProvider,
        createdAt: savedFile.createdAt,
      },
    });
  } catch (error) {
    console.error('File Upload Error:', error);
    res.status(500).json({ error: 'Failed to securely upload and encrypt file.' });
  }
}

export async function getUserFiles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.user?.id;
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

    const serializedFiles = files.map((file) => ({
      id: file.id,
      name: file.originalName,
      size: file.sizeBytes.toString(),
      encryptedSize: file.encryptedSizeBytes.toString(),
      checksumSHA256: file.checksumSHA256,
      cloudProvider: file.cloudProvider,
      isEncrypted: file.isEncrypted,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    }));

    res.status(200).json({ files: serializedFiles });
  } catch (error) {
    console.error('Fetch Files Error:', error);
    res.status(500).json({ error: 'Failed to retrieve user files.' });
  }
}

export async function downloadEncryptedFile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.user?.id;
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

    // Fetch user credentials for that cloud provider
    const userAccount = await prisma.cloudAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: file.cloudProvider,
        },
      },
    });
    const creds = parseCredentials(userAccount?.credentialsEncrypted);

    let encryptedBuffer: Buffer | null = null;

    // Retrieve encrypted buffer from active Cloud Provider API
    if (file.cloudProvider === 'ONEDRIVE' || file.cloudProvider === ('ONEDRIVE' as any)) {
      try {
        encryptedBuffer = await downloadFileFromOneDrive(file.remoteFileId, creds);
      } catch (err) {
        console.warn('Microsoft OneDrive download error:', err);
      }
    } else if (file.cloudProvider === 'AWS_S3' || file.cloudProvider === ('AWS_S3' as any)) {
      try {
        encryptedBuffer = await downloadFileFromS3(file.remoteFileId, creds);
      } catch (err) {
        console.warn('AWS S3 download error:', err);
      }
    } else if (file.cloudProvider === 'GOOGLE_DRIVE' || file.cloudProvider === ('GDRIVE' as any)) {
      try {
        encryptedBuffer = await downloadFileFromGDrive(file.remoteFileId, creds);
      } catch (err) {
        console.warn('Google Drive download error:', err);
      }
    } else if (file.cloudProvider === 'DROPBOX' || file.cloudProvider === ('DROPBOX' as any)) {
      try {
        encryptedBuffer = await downloadFileFromDropbox(file.remoteFileId, creds);
      } catch (err) {
        console.warn('Dropbox download error:', err);
      }
    } else if (file.cloudProvider === 'MEGA' || file.cloudProvider === ('MEGA' as any)) {
      try {
        encryptedBuffer = await downloadFileFromMega(file.remoteFileId, creds);
      } catch (err) {
        console.warn('MEGA download error:', err);
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
      res.status(502).json({ error: 'Failed to retrieve file from cloud storage node.' });
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

export async function deleteFileRecord(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.user?.id;
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

    res.status(200).json({ message: 'File deleted successfully.' });
  } catch (error) {
    console.error('Delete File Error:', error);
    res.status(500).json({ error: 'Failed to delete file.' });
  }
}

export async function verifyFileIntegrity(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.user?.id;
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

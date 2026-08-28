import { Request, Response } from 'express';
import { CloudProvider } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import querystring from 'querystring';
import https from 'https';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { getAggregatedStorageQuota } from '../services/storage/cloudBalancer.service';
import {
  getDropboxAuthUrl,
  exchangeDropboxCode,
  getDropboxStorageUsage,
} from '../services/storage/dropbox.service';
import {
  getOneDriveAuthUrl,
  exchangeOneDriveCode,
  getOneDriveStorageUsage,
} from '../services/storage/onedrive.service';
import {
  getGDriveAuthUrl,
  getGDriveStorageUsage,
} from '../services/storage/gdrive.service';
import { prisma } from '../config/db';

function saveEnvVariable(key: string, value: string) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (envContent.includes(`${key}=`)) {
        envContent = envContent.replace(new RegExp(`${key}=.*`, 'g'), `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}\n`;
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
    }
  } catch (e) {
    console.error(`Failed to write ${key} to .env:`, e);
  }
}

function extractUserIdFromReq(req: Request): string | null {
  const token = (req.query.token as string) || req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const secret = process.env.JWT_SECRET || 'supersecret_jwt_key_cloudfusion_production';
      const decoded = jwt.verify(token, secret) as any;
      return decoded.userId || decoded.id || null;
    } catch {
      // ignore
    }
  }
  return (req.query.userId as string) || (req as any).user?.userId || null;
}

export async function getStorageQuota(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const quotaData = await getAggregatedStorageQuota(userId);
    res.status(200).json(quotaData);
  } catch (error) {
    console.error('Storage Quota Error:', error);
    res.status(500).json({ error: 'Failed to retrieve storage quota metrics.' });
  }
}

export async function getCloudAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const accounts = await prisma.cloudAccount.findMany({
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

    const resultAccounts = accounts.map((acc) => ({
      ...acc,
      totalStorageBytes: acc.totalStorageBytes.toString(),
      usedStorageBytes: acc.usedStorageBytes.toString(),
    }));

    res.status(200).json({ accounts: resultAccounts });
  } catch (error) {
    console.error('Cloud Accounts Error:', error);
    res.status(500).json({ error: 'Failed to retrieve cloud accounts.' });
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

    let credentialsEncrypted = JSON.stringify({ status: 'connected', timestamp: new Date() });
    let resolvedEmail = accountEmail || 'connected@cloudfusion.io';
    let totalStorageBytes = BigInt(5368709120);
    let usedStorageBytes = BigInt(0);

    // 1. AWS S3 Connection Handling
    if (targetProvider === CloudProvider.AWS_S3) {
      const { accessKeyId, secretAccessKey, region, bucketName } = req.body;
      const targetAccessKey = accessKeyId || process.env.AWS_ACCESS_KEY_ID;
      const targetSecretKey = secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
      const targetRegion = region || process.env.AWS_REGION || 'eu-north-1';
      const targetBucket = bucketName || process.env.AWS_S3_BUCKET_NAME || 'cloudfusion-storage-bucket-390630837624-eu-north-1-an';

      if (!targetAccessKey || !targetSecretKey) {
        res.status(400).json({ error: 'AWS Access Key ID and Secret Access Key are required.' });
        return;
      }

      const { verifyS3Credentials, getS3StorageUsage } = await import('../services/storage/s3.service');
      const verifyRes = await verifyS3Credentials(targetAccessKey, targetSecretKey, targetRegion, targetBucket);
      if (!verifyRes.success) {
        res.status(400).json({ error: verifyRes.error || 'Failed to authenticate AWS S3 credentials.' });
        return;
      }

      credentialsEncrypted = JSON.stringify({
        accessKeyId: targetAccessKey,
        secretAccessKey: targetSecretKey,
        region: targetRegion,
        bucketName: targetBucket,
      });
      resolvedEmail = `AWS S3 (${targetRegion} / ${targetBucket})`;

      const s3Quota = await getS3StorageUsage({
        accessKeyId: targetAccessKey,
        secretAccessKey: targetSecretKey,
        region: targetRegion,
        bucketName: targetBucket,
      });
      totalStorageBytes = s3Quota.totalBytes;
      usedStorageBytes = s3Quota.usedBytes;
    }

    // 2. MEGA Cloud Connection Handling
    if (targetProvider === CloudProvider.MEGA) {
      const { email, password } = req.body;
      const targetEmail = email || process.env.MEGA_EMAIL;
      const targetPassword = password || process.env.MEGA_PASSWORD;

      if (!targetEmail || !targetPassword) {
        res.status(400).json({ error: 'MEGA Account Email and Password are required.' });
        return;
      }

      const { verifyMegaCredentials, getMegaStorageUsage } = await import('../services/storage/mega.service');
      const verifyRes = await verifyMegaCredentials(targetEmail, targetPassword);
      if (!verifyRes.success) {
        res.status(400).json({ error: verifyRes.error || 'Failed to authenticate with MEGA.' });
        return;
      }

      credentialsEncrypted = JSON.stringify({
        email: targetEmail,
        password: targetPassword,
      });
      resolvedEmail = targetEmail;

      const megaQuota = await getMegaStorageUsage({ email: targetEmail, password: targetPassword });
      totalStorageBytes = megaQuota.totalBytes;
      usedStorageBytes = megaQuota.usedBytes;
    }

    // 3. Upsert per-user cloud account in PostgreSQL
    const account = await prisma.cloudAccount.upsert({
      where: {
        userId_provider: {
          userId,
          provider: targetProvider,
        },
      },
      update: {
        accountEmail: resolvedEmail,
        credentialsEncrypted,
        totalStorageBytes,
        usedStorageBytes,
      },
      create: {
        userId,
        provider: targetProvider,
        accountEmail: resolvedEmail,
        credentialsEncrypted,
        isPrimary: targetProvider === CloudProvider.MEGA,
        totalStorageBytes,
        usedStorageBytes,
      },
    });

    res.status(200).json({
      message: `${provider} cloud account successfully linked to your CloudFusion mesh.`,
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

    const upper = provider.toUpperCase();

    await prisma.cloudAccount.deleteMany({
      where: {
        userId,
        provider: upper as any,
      },
    });

    res.status(200).json({ message: `${provider} account unlinked successfully.` });
  } catch (error) {
    console.error('Disconnect Account Error:', error);
    res.status(500).json({ error: 'Failed to unlink cloud account.' });
  }
}

// ----------------------------------------------------
// 1. MICROSOFT ONEDRIVE OAUTH HANDLERS
// ----------------------------------------------------
export async function getOneDriveAuthUrlHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = extractUserIdFromReq(req) || '';
    const redirectUri = (req.query.redirectUri as string) || `http://localhost:5000/api/storage/onedrive/callback`;
    const authUrl = getOneDriveAuthUrl(redirectUri, userId);
    res.status(200).json({ authUrl });
  } catch (error: any) {
    console.error('OneDrive Auth URL Error:', error);
    res.status(500).json({ error: 'Failed to generate OneDrive authentication URL.' });
  }
}

export async function redirectToOneDriveLogin(req: Request, res: Response): Promise<void> {
  try {
    const userId = extractUserIdFromReq(req) || '';
    const redirectUri = 'http://localhost:5000/api/storage/onedrive/callback';
    const authUrl = getOneDriveAuthUrl(redirectUri, userId);
    res.redirect(authUrl);
  } catch (error: any) {
    res.status(500).send('Error initiating OneDrive authorization.');
  }
}

export async function handleOneDriveGetCallback(req: Request, res: Response): Promise<void> {
  try {
    const code = req.query.code as string;
    const userId = req.query.state as string;
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    if (!code) {
      res.redirect(`${clientUrl}/dashboard?error=onedrive_code_missing`);
      return;
    }

    const redirectUri = 'http://localhost:5000/api/storage/onedrive/callback';
    const tokenResult = await exchangeOneDriveCode(code, redirectUri);

    if (tokenResult?.refreshToken) {
      if (userId) {
        const usage = await getOneDriveStorageUsage({ refreshToken: tokenResult.refreshToken });
        await prisma.cloudAccount.upsert({
          where: {
            userId_provider: {
              userId,
              provider: CloudProvider.ONEDRIVE,
            },
          },
          update: {
            accountEmail: usage.userEmail || 'onedrive@cloudfusion.io',
            credentialsEncrypted: JSON.stringify({
              refreshToken: tokenResult.refreshToken,
              accessToken: tokenResult.accessToken,
            }),
            totalStorageBytes: usage.totalBytes,
            usedStorageBytes: usage.usedBytes,
          },
          create: {
            userId,
            provider: CloudProvider.ONEDRIVE,
            accountEmail: usage.userEmail || 'onedrive@cloudfusion.io',
            credentialsEncrypted: JSON.stringify({
              refreshToken: tokenResult.refreshToken,
              accessToken: tokenResult.accessToken,
            }),
            totalStorageBytes: usage.totalBytes,
            usedStorageBytes: usage.usedBytes,
          },
        });
      } else {
        process.env.ONEDRIVE_REFRESH_TOKEN = tokenResult.refreshToken;
        saveEnvVariable('ONEDRIVE_REFRESH_TOKEN', tokenResult.refreshToken);
      }

      res.redirect(`${clientUrl}/dashboard?connected=onedrive`);
    } else {
      res.redirect(`${clientUrl}/dashboard?error=onedrive_auth_failed`);
    }
  } catch (error) {
    console.error('OneDrive Callback Error:', error);
    res.redirect(`http://localhost:3000/dashboard?error=onedrive_server_error`);
  }
}

export async function handleOneDriveCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { code, redirectUri } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required.' });
      return;
    }

    const { exchangeOneDriveCode, getOneDriveStorageUsage } = await import('../services/storage/onedrive.service');
    const targetRedirectUri = redirectUri || 'http://localhost:5000/api/storage/onedrive/callback';
    const tokenResult = await exchangeOneDriveCode(code, targetRedirectUri);

    if (!tokenResult?.refreshToken) {
      res.status(400).json({ error: 'Failed to retrieve refresh token.' });
      return;
    }

    if (userId) {
      const usage = await getOneDriveStorageUsage({ refreshToken: tokenResult.refreshToken });
      await prisma.cloudAccount.upsert({
        where: {
          userId_provider: {
            userId,
            provider: CloudProvider.ONEDRIVE,
          },
        },
        update: {
          accountEmail: usage.userEmail || 'onedrive@cloudfusion.io',
          credentialsEncrypted: JSON.stringify({
            refreshToken: tokenResult.refreshToken,
            accessToken: tokenResult.accessToken,
          }),
          totalStorageBytes: usage.totalBytes,
          usedStorageBytes: usage.usedBytes,
        },
        create: {
          userId,
          provider: CloudProvider.ONEDRIVE,
          accountEmail: usage.userEmail || 'onedrive@cloudfusion.io',
          credentialsEncrypted: JSON.stringify({
            refreshToken: tokenResult.refreshToken,
            accessToken: tokenResult.accessToken,
          }),
          totalStorageBytes: usage.totalBytes,
          usedStorageBytes: usage.usedBytes,
        },
      });
    }

    res.status(200).json({
      message: 'Microsoft OneDrive connected successfully!',
      refreshToken: tokenResult.refreshToken,
    });
  } catch (error) {
    res.status(500).json({ error: 'Callback processing failed.' });
  }
}

// ----------------------------------------------------
// 2. GOOGLE DRIVE OAUTH HANDLERS
// ----------------------------------------------------
export async function redirectToGDriveLogin(req: Request, res: Response): Promise<void> {
  try {
    const userId = extractUserIdFromReq(req) || '';
    const redirectUri = 'http://localhost:5000/api/storage/gdrive/callback';
    const authUrl = getGDriveAuthUrl(redirectUri, userId);
    res.redirect(authUrl);
  } catch (e) {
    res.status(500).send('Error redirecting to Google login.');
  }
}

export async function handleGDriveGetCallback(req: Request, res: Response): Promise<void> {
  try {
    const code = req.query.code as string;
    const userId = req.query.state as string;
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    if (!code) {
      res.redirect(`${clientUrl}/dashboard?error=gdrive_code_missing`);
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = 'http://localhost:5000/api/storage/gdrive/callback';

    const postData = querystring.stringify({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenReq = https.request(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (tokenRes) => {
        let data = '';
        tokenRes.on('data', (c) => (data += c));
        tokenRes.on('end', async () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.refresh_token) {
              if (userId) {
                const usage = await getGDriveStorageUsage({ refreshToken: parsed.refresh_token });
                await prisma.cloudAccount.upsert({
                  where: {
                    userId_provider: {
                      userId,
                      provider: CloudProvider.GOOGLE_DRIVE,
                    },
                  },
                  update: {
                    accountEmail: usage.userEmail || 'gdrive@cloudfusion.io',
                    credentialsEncrypted: JSON.stringify({
                      refreshToken: parsed.refresh_token,
                      accessToken: parsed.access_token,
                    }),
                    totalStorageBytes: usage.totalBytes,
                    usedStorageBytes: usage.usedBytes,
                  },
                  create: {
                    userId,
                    provider: CloudProvider.GOOGLE_DRIVE,
                    accountEmail: usage.userEmail || 'gdrive@cloudfusion.io',
                    credentialsEncrypted: JSON.stringify({
                      refreshToken: parsed.refresh_token,
                      accessToken: parsed.access_token,
                    }),
                    totalStorageBytes: usage.totalBytes,
                    usedStorageBytes: usage.usedBytes,
                  },
                });
              } else {
                process.env.GOOGLE_REFRESH_TOKEN = parsed.refresh_token;
                saveEnvVariable('GOOGLE_REFRESH_TOKEN', parsed.refresh_token);
              }
              res.redirect(`${clientUrl}/dashboard?connected=gdrive`);
            } else {
              res.redirect(`${clientUrl}/dashboard?connected=gdrive_existing`);
            }
          } catch {
            res.redirect(`${clientUrl}/dashboard?error=gdrive_parse_error`);
          }
        });
      }
    );

    tokenReq.write(postData);
    tokenReq.end();
  } catch (e) {
    res.redirect('http://localhost:3000/dashboard?error=gdrive_server_error');
  }
}

// ----------------------------------------------------
// 3. DROPBOX OAUTH HANDLERS
// ----------------------------------------------------
export async function getDropboxAuthUrlHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = extractUserIdFromReq(req) || '';
    const redirectUri = (req.query.redirectUri as string) || 'http://localhost:5000/api/storage/dropbox/callback';
    const authUrl = getDropboxAuthUrl(redirectUri, userId);
    res.status(200).json({ authUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate Dropbox auth URL.' });
  }
}

export async function redirectToDropboxLogin(req: Request, res: Response): Promise<void> {
  try {
    const userId = extractUserIdFromReq(req) || '';
    const redirectUri = 'http://localhost:5000/api/storage/dropbox/callback';
    const authUrl = getDropboxAuthUrl(redirectUri, userId);
    res.redirect(authUrl);
  } catch (e) {
    res.status(500).send('Error redirecting to Dropbox.');
  }
}

export async function handleDropboxGetCallback(req: Request, res: Response): Promise<void> {
  try {
    const code = req.query.code as string;
    const userId = req.query.state as string;
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    if (!code) {
      res.redirect(`${clientUrl}/dashboard?error=dropbox_code_missing`);
      return;
    }

    const redirectUri = 'http://localhost:5000/api/storage/dropbox/callback';
    const tokenResult = await exchangeDropboxCode(code, redirectUri);

    if (tokenResult && tokenResult.accessToken) {
      if (userId) {
        const usage = await getDropboxStorageUsage({
          refreshToken: tokenResult.refreshToken,
          accessToken: tokenResult.accessToken,
        });
        await prisma.cloudAccount.upsert({
          where: {
            userId_provider: {
              userId,
              provider: CloudProvider.DROPBOX,
            },
          },
          update: {
            accountEmail: usage.userEmail || 'dropbox@cloudfusion.io',
            credentialsEncrypted: JSON.stringify({
              refreshToken: tokenResult.refreshToken,
              accessToken: tokenResult.accessToken,
            }),
            totalStorageBytes: usage.totalBytes,
            usedStorageBytes: usage.usedBytes,
          },
          create: {
            userId,
            provider: CloudProvider.DROPBOX,
            accountEmail: usage.userEmail || 'dropbox@cloudfusion.io',
            credentialsEncrypted: JSON.stringify({
              refreshToken: tokenResult.refreshToken,
              accessToken: tokenResult.accessToken,
            }),
            totalStorageBytes: usage.totalBytes,
            usedStorageBytes: usage.usedBytes,
          },
        });
      } else {
        process.env.DROPBOX_ACCESS_TOKEN = tokenResult.accessToken;
        saveEnvVariable('DROPBOX_ACCESS_TOKEN', tokenResult.accessToken);
        if (tokenResult.refreshToken) {
          process.env.DROPBOX_REFRESH_TOKEN = tokenResult.refreshToken;
          saveEnvVariable('DROPBOX_REFRESH_TOKEN', tokenResult.refreshToken);
        }
      }

      res.redirect(`${clientUrl}/dashboard?connected=dropbox`);
    } else {
      res.redirect(`${clientUrl}/dashboard?error=dropbox_auth_failed`);
    }
  } catch (e) {
    console.error('Dropbox OAuth callback error:', e);
    res.redirect('http://localhost:3000/dashboard?error=dropbox_server_error');
  }
}

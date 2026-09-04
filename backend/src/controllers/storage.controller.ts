import { Request, Response } from 'express';
import { CloudProvider } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import querystring from 'querystring';
import https from 'https';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { getAggregatedStorageQuota, invalidateQuotaCache } from '../services/storage/cloudBalancer.service';
import { resolveValidUserId } from '../utils/userResolver';
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
  const token = (req.query.token as string) || req.headers.authorization?.split(' ')[1] || (req as any).cookies?.token;
  if (token) {
    try {
      const secret = process.env.JWT_SECRET || 'cloudfusion_master_jwt_secret_key_32_bytes_min_prod';
      const decoded = jwt.verify(token, secret) as any;
      return decoded.userId || decoded.id || decoded.email || null;
    } catch {
      // ignore
    }
  }
  return (req.query.userId as string) || (req as any).user?.userId || (req as any).user?.id || (req as any).user?.email || null;
}

export async function getStorageQuota(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
    const forceLive = req.query.refresh === 'true';
    const quotaData = await getAggregatedStorageQuota(userId, forceLive);
    res.status(200).json(quotaData);
  } catch (error) {
    console.error('Storage Quota Error:', error);
    res.status(500).json({ error: 'Failed to retrieve storage quota metrics.' });
  }
}

export async function getCloudAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
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
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
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
    let totalStorageBytes = targetProvider === CloudProvider.GOOGLE_DRIVE 
      ? BigInt(16106127360) 
      : targetProvider === CloudProvider.MEGA 
      ? BigInt(21474836480) 
      : targetProvider === CloudProvider.DROPBOX 
      ? BigInt(2147483648) 
      : BigInt(5368709120);
    let usedStorageBytes = BigInt(0);

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!userRecord) {
      res.status(401).json({ error: 'User record not found.' });
      return;
    }
    const registeredEmail = userRecord.email.toLowerCase().trim();

    // 1. AWS S3 Connection Handling
    if (targetProvider === CloudProvider.AWS_S3) {
      const { accessKeyId, secretAccessKey, region, bucketName } = req.body;
      const targetAccessKey = accessKeyId;
      const targetSecretKey = secretAccessKey;
      const targetRegion = region || 'eu-north-1';
      const targetBucket = bucketName;

      if (!targetAccessKey || !targetSecretKey || !targetBucket) {
        res.status(400).json({ error: 'AWS Access Key ID, Secret Access Key, and Bucket Name are required.' });
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
      const targetEmail = (email || '').toLowerCase().trim();
      const targetPassword = password;

      if (!targetEmail || !targetPassword) {
        res.status(400).json({ error: 'MEGA account email and password are required.' });
        return;
      }

      if (targetEmail !== registeredEmail) {
        res.status(400).json({
          error: `Email mismatch: You can only link a MEGA account registered to your CloudFusion account email (${userRecord.email}). You entered: ${targetEmail}`,
        });
        return;
      }

      const { verifyMegaCredentials, getMegaStorageUsage } = await import('../services/storage/mega.service');
      const verifyRes = await verifyMegaCredentials(targetEmail, targetPassword);
      if (!verifyRes.success) {
        res.status(400).json({ error: verifyRes.error || 'Failed to authenticate with MEGA. Please verify your credentials.' });
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

    // If provider is OAuth-based and already has valid credentials, preserve them
    const existingAccount = await prisma.cloudAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: targetProvider,
        },
      },
    });
    if (existingAccount) {
      try {
        const parsed = JSON.parse(existingAccount.credentialsEncrypted);
        if (parsed.refreshToken || parsed.accessToken || (parsed.accessKeyId && targetProvider === CloudProvider.AWS_S3)) {
          credentialsEncrypted = existingAccount.credentialsEncrypted;
          resolvedEmail = existingAccount.accountEmail || resolvedEmail;
          totalStorageBytes = existingAccount.totalStorageBytes;
          usedStorageBytes = existingAccount.usedStorageBytes;
        }
      } catch {}
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

    invalidateQuotaCache(userId);

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
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
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

    invalidateQuotaCache(userId);

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
    const rawUserId = extractUserIdFromReq(req) || '';
    const userId = await resolveValidUserId(rawUserId);
    const redirectUri = (req.query.redirectUri as string) || `http://localhost:5000/api/storage/onedrive/callback`;
    const authUrl = getOneDriveAuthUrl(redirectUri, userId);
    res.status(200).json({ authUrl });
  } catch (error: any) {
    console.error('OneDrive Auth URL Error:', error);
    res.status(500).json({ error: 'Failed to generate OneDrive authentication URL.' });
  }
}

function renderOAuthSuccessHtml(providerTitle: string, providerKey: string): string {
  const deepLink = `cloudfusion://connected?provider=${providerKey}&status=success`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${providerTitle} Connected - CloudFusion</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0B0F19; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; text-align: center; }
    .card { background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px; padding: 40px 24px; max-width: 420px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); backdrop-filter: blur(16px); }
    .icon-wrap { width: 72px; height: 72px; border-radius: 24px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 34px; color: #10B981; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 10px; color: #FFFFFF; letter-spacing: -0.02em; }
    p { color: #94A3B8; font-size: 14px; line-height: 1.6; margin-bottom: 30px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 16px; border-radius: 14px; background: linear-gradient(135deg, #06B6D4, #3B82F6); color: #FFFFFF; font-weight: 700; font-size: 15px; text-decoration: none; border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(6, 182, 212, 0.4); }
    .btn:active { transform: scale(0.98); }
    .subtext { margin-top: 18px; font-size: 12px; color: #64748B; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">✓</div>
    <h1>${providerTitle} Connected!</h1>
    <p>Your cloud node was authenticated and linked to your CloudFusion vault.</p>
    <a href="${deepLink}" class="btn">Return to CloudFusion App</a>
    <div class="subtext">Attempting to return you to the app automatically...</div>
  </div>
  <script>
    setTimeout(function() {
      window.location.href = ${JSON.stringify(deepLink)};
    }, 400);
  </script>
</body>
</html>`;
}

function renderOAuthErrorHtml(providerTitle: string, errorMsg: string): string {
  const deepLink = `cloudfusion://connected?status=error`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${providerTitle} Error - CloudFusion</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0B0F19; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; text-align: center; }
    .card { background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 24px; padding: 40px 24px; max-width: 420px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 10px; color: #F87171; }
    p { color: #94A3B8; font-size: 14px; line-height: 1.6; margin-bottom: 30px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 16px; border-radius: 14px; background: #EF4444; color: #FFFFFF; font-weight: 700; font-size: 15px; text-decoration: none; border: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${providerTitle} Link Failed</h1>
    <p>${errorMsg || 'Could not complete authentication.'}</p>
    <a href="${deepLink}" class="btn">Return to CloudFusion App</a>
  </div>
</body>
</html>`;
}

export async function redirectToOneDriveLogin(req: Request, res: Response): Promise<void> {
  try {
    const rawUserId = extractUserIdFromReq(req) || '';
    const userId = await resolveValidUserId(rawUserId);
    const isMobile = req.query.source === 'mobile' || (req.headers['user-agent'] && /mobile|android|iphone|ipad/i.test(req.headers['user-agent']));
    const state = isMobile ? `${userId}___mobile` : userId;
    const redirectUri = 'http://localhost:5000/api/storage/onedrive/callback';
    const authUrl = getOneDriveAuthUrl(redirectUri, state);
    res.redirect(authUrl);
  } catch (error: any) {
    res.status(500).send('Error initiating OneDrive authorization.');
  }
}

export async function handleOneDriveGetCallback(req: Request, res: Response): Promise<void> {
  try {
    const code = req.query.code as string;
    const rawState = (req.query.state as string) || '';
    const isMobile = rawState.includes('___mobile') || req.query.source === 'mobile' || (req.headers['user-agent'] && /mobile|android|iphone|ipad/i.test(req.headers['user-agent'] || ''));
    const rawUserId = rawState.replace('___mobile', '');
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    if (!code) {
      if (isMobile) {
        res.send(renderOAuthErrorHtml('Microsoft OneDrive', 'Authorization code missing or cancelled.'));
        return;
      }
      res.redirect(`${clientUrl}/dashboard?error=onedrive_code_missing`);
      return;
    }

    const redirectUri = 'http://localhost:5000/api/storage/onedrive/callback';
    const tokenResult = await exchangeOneDriveCode(code, redirectUri);

    if (tokenResult?.refreshToken) {
      const userId = await resolveValidUserId(rawUserId);
      if (userId) {
        const userRecord = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true },
        });

        const usage = await getOneDriveStorageUsage({ refreshToken: tokenResult.refreshToken });

        if (userRecord && usage.userEmail) {
          const onedriveEmail = usage.userEmail.toLowerCase().trim();
          const registeredEmail = userRecord.email.toLowerCase().trim();
          if (onedriveEmail !== registeredEmail) {
            const errorMsg = `Microsoft account email mismatch: You authorized with ${usage.userEmail}, but your CloudFusion account is registered to ${userRecord.email}. Please link the Microsoft account matching your registered email.`;
            if (isMobile) {
              res.send(renderOAuthErrorHtml('Microsoft OneDrive', errorMsg));
              return;
            }
            res.redirect(`${clientUrl}/dashboard?error=${encodeURIComponent(errorMsg)}`);
            return;
          }
        }

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
        invalidateQuotaCache(userId);
      } else {
        process.env.ONEDRIVE_REFRESH_TOKEN = tokenResult.refreshToken;
        saveEnvVariable('ONEDRIVE_REFRESH_TOKEN', tokenResult.refreshToken);
      }

      if (isMobile) {
        res.send(renderOAuthSuccessHtml('Microsoft OneDrive', 'ONEDRIVE'));
        return;
      }
      res.redirect(`${clientUrl}/dashboard?connected=onedrive`);
    } else {
      if (isMobile) {
        res.send(renderOAuthErrorHtml('Microsoft OneDrive', 'Token exchange failed.'));
        return;
      }
      res.redirect(`${clientUrl}/dashboard?error=onedrive_auth_failed`);
    }
  } catch (error) {
    console.error('OneDrive Callback Error:', error);
    res.redirect(`http://localhost:3000/dashboard?error=onedrive_server_error`);
  }
}

export async function handleOneDriveCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const rawUserId = req.user?.userId || req.user?.id;
    const userId = await resolveValidUserId(rawUserId, req.user?.email, req.user?.name);
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
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      });
      const usage = await getOneDriveStorageUsage({ refreshToken: tokenResult.refreshToken });

      if (userRecord && usage.userEmail) {
        const onedriveEmail = usage.userEmail.toLowerCase().trim();
        const registeredEmail = userRecord.email.toLowerCase().trim();
        if (onedriveEmail !== registeredEmail) {
          res.status(400).json({
            error: `Microsoft account email mismatch: You authorized with ${usage.userEmail}, but your CloudFusion account is registered to ${userRecord.email}.`,
          });
          return;
        }
      }

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
      invalidateQuotaCache(userId);
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
    const rawUserId = extractUserIdFromReq(req) || '';
    const userId = await resolveValidUserId(rawUserId);
    const isMobile = req.query.source === 'mobile' || (req.headers['user-agent'] && /mobile|android|iphone|ipad/i.test(req.headers['user-agent']));
    const state = isMobile ? `${userId}___mobile` : userId;
    const redirectUri = 'http://localhost:5000/api/storage/gdrive/callback';
    const authUrl = getGDriveAuthUrl(redirectUri, state);
    res.redirect(authUrl);
  } catch (e) {
    res.status(500).send('Error redirecting to Google login.');
  }
}

export async function handleGDriveGetCallback(req: Request, res: Response): Promise<void> {
  try {
    const code = req.query.code as string;
    const rawState = (req.query.state as string) || '';
    const isMobile = rawState.includes('___mobile') || req.query.source === 'mobile' || (req.headers['user-agent'] && /mobile|android|iphone|ipad/i.test(req.headers['user-agent'] || ''));
    const rawUserId = rawState.replace('___mobile', '');
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    if (!code) {
      if (isMobile) {
        res.send(renderOAuthErrorHtml('Google Drive', 'Google authorization code missing or cancelled.'));
        return;
      }
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
            if (parsed.error) {
              console.error('[Google Drive Callback] OAuth error from Google:', parsed);
              if (isMobile) {
                res.send(renderOAuthErrorHtml('Google Drive', parsed.error_description || parsed.error));
                return;
              }
              res.redirect(`${clientUrl}/dashboard?error=gdrive_${encodeURIComponent(parsed.error_description || parsed.error)}`);
              return;
            }

            const userId = await resolveValidUserId(rawUserId);
            const userRecord = userId
              ? await prisma.user.findUnique({
                  where: { id: userId },
                  select: { id: true, email: true },
                })
              : null;

            if (parsed.refresh_token) {
              if (userId) {
                const usage = await getGDriveStorageUsage({ refreshToken: parsed.refresh_token });

                if (userRecord && usage.userEmail) {
                  const gdriveEmail = usage.userEmail.toLowerCase().trim();
                  const registeredEmail = userRecord.email.toLowerCase().trim();
                  if (gdriveEmail !== registeredEmail) {
                    const errorMsg = `Google account email mismatch: You authorized with ${usage.userEmail}, but your CloudFusion account is registered to ${userRecord.email}. Please link the Google account matching your registered email.`;
                    if (isMobile) {
                      res.send(renderOAuthErrorHtml('Google Drive', errorMsg));
                      return;
                    }
                    res.redirect(`${clientUrl}/dashboard?error=${encodeURIComponent(errorMsg)}`);
                    return;
                  }
                }

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
                invalidateQuotaCache(userId);
              } else {
                process.env.GOOGLE_REFRESH_TOKEN = parsed.refresh_token;
                saveEnvVariable('GOOGLE_REFRESH_TOKEN', parsed.refresh_token);
              }

              if (isMobile) {
                res.send(renderOAuthSuccessHtml('Google Drive', 'GOOGLE_DRIVE'));
                return;
              }
              res.redirect(`${clientUrl}/dashboard?connected=gdrive`);
            } else if (parsed.access_token) {
              if (userId) {
                const existing = await prisma.cloudAccount.findUnique({
                  where: {
                    userId_provider: {
                      userId,
                      provider: CloudProvider.GOOGLE_DRIVE,
                    },
                  },
                });
                let existingRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
                if (existing) {
                  try {
                    const creds = JSON.parse(existing.credentialsEncrypted);
                    if (creds.refreshToken) existingRefreshToken = creds.refreshToken;
                  } catch {}
                }
                const usage = await getGDriveStorageUsage({ refreshToken: existingRefreshToken });

                if (userRecord && usage.userEmail) {
                  const gdriveEmail = usage.userEmail.toLowerCase().trim();
                  const registeredEmail = userRecord.email.toLowerCase().trim();
                  if (gdriveEmail !== registeredEmail) {
                    const errorMsg = `Google account email mismatch: You authorized with ${usage.userEmail}, but your CloudFusion account is registered to ${userRecord.email}. Please link the Google account matching your registered email.`;
                    if (isMobile) {
                      res.send(renderOAuthErrorHtml('Google Drive', errorMsg));
                      return;
                    }
                    res.redirect(`${clientUrl}/dashboard?error=${encodeURIComponent(errorMsg)}`);
                    return;
                  }
                }

                await prisma.cloudAccount.upsert({
                  where: {
                    userId_provider: {
                      userId,
                      provider: CloudProvider.GOOGLE_DRIVE,
                    },
                  },
                  update: {
                    accountEmail: usage.userEmail || existing?.accountEmail || 'gdrive@cloudfusion.io',
                    credentialsEncrypted: JSON.stringify({
                      refreshToken: existingRefreshToken,
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
                      refreshToken: existingRefreshToken,
                      accessToken: parsed.access_token,
                    }),
                    totalStorageBytes: usage.totalBytes,
                    usedStorageBytes: usage.usedBytes,
                  },
                });
                invalidateQuotaCache(userId);
              }

              if (isMobile) {
                res.send(renderOAuthSuccessHtml('Google Drive', 'GOOGLE_DRIVE'));
                return;
              }
              res.redirect(`${clientUrl}/dashboard?connected=gdrive`);
            } else {
              if (isMobile) {
                res.send(renderOAuthSuccessHtml('Google Drive', 'GOOGLE_DRIVE'));
                return;
              }
              res.redirect(`${clientUrl}/dashboard?connected=gdrive_existing`);
            }
          } catch (err: any) {
            console.error('[Google Drive Callback] Exception during token parsing:', err);
            if (isMobile) {
              res.send(renderOAuthErrorHtml('Google Drive', err.message || 'Error processing Google callback.'));
              return;
            }
            res.redirect(`${clientUrl}/dashboard?error=gdrive_parse_error`);
          }
        });
      }
    );

    tokenReq.on('error', (err) => {
      console.error('[Google Drive Callback] Token request network error:', err);
      if (isMobile) {
        res.send(renderOAuthErrorHtml('Google Drive', 'Network error reaching Google servers.'));
        return;
      }
      res.redirect(`${clientUrl}/dashboard?error=gdrive_network_error`);
    });

    tokenReq.write(postData);
    tokenReq.end();
  } catch (error) {
    console.error('Google Drive Callback Exception:', error);
    res.redirect(`http://localhost:3000/dashboard?error=gdrive_server_error`);
  }
}

// ----------------------------------------------------
// 3. DROPBOX OAUTH HANDLERS
// ----------------------------------------------------
export async function getDropboxAuthUrlHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawUserId = extractUserIdFromReq(req) || '';
    const userId = await resolveValidUserId(rawUserId);
    const redirectUri = (req.query.redirectUri as string) || 'http://localhost:5000/api/storage/dropbox/callback';
    const authUrl = getDropboxAuthUrl(redirectUri, userId);
    res.status(200).json({ authUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate Dropbox auth URL.' });
  }
}

export async function redirectToDropboxLogin(req: Request, res: Response): Promise<void> {
  try {
    const rawUserId = extractUserIdFromReq(req) || '';
    const userId = await resolveValidUserId(rawUserId);
    const isMobile = req.query.source === 'mobile' || (req.headers['user-agent'] && /mobile|android|iphone|ipad/i.test(req.headers['user-agent']));
    const state = isMobile ? `${userId}___mobile` : userId;
    const redirectUri = 'http://localhost:5000/api/storage/dropbox/callback';
    const authUrl = getDropboxAuthUrl(redirectUri, state);
    res.redirect(authUrl);
  } catch (e) {
    res.status(500).send('Error redirecting to Dropbox.');
  }
}

export async function handleDropboxGetCallback(req: Request, res: Response): Promise<void> {
  try {
    const code = req.query.code as string;
    const rawState = (req.query.state as string) || '';
    const isMobile = rawState.includes('___mobile') || req.query.source === 'mobile' || (req.headers['user-agent'] && /mobile|android|iphone|ipad/i.test(req.headers['user-agent'] || ''));
    const rawUserId = rawState.replace('___mobile', '');
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    if (!code) {
      if (isMobile) {
        res.send(renderOAuthErrorHtml('Dropbox', 'Authorization code missing or cancelled.'));
        return;
      }
      res.redirect(`${clientUrl}/dashboard?error=dropbox_code_missing`);
      return;
    }

    const redirectUri = 'http://localhost:5000/api/storage/dropbox/callback';
    const tokenResult = await exchangeDropboxCode(code, redirectUri);

    if (tokenResult && tokenResult.accessToken) {
      const userId = await resolveValidUserId(rawUserId);
      if (userId) {
        const userRecord = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true },
        });

        const usage = await getDropboxStorageUsage({
          refreshToken: tokenResult.refreshToken,
          accessToken: tokenResult.accessToken,
        });

        if (userRecord && usage.userEmail) {
          const dropboxEmail = usage.userEmail.toLowerCase().trim();
          const registeredEmail = userRecord.email.toLowerCase().trim();
          if (dropboxEmail !== registeredEmail) {
            const errorMsg = `Dropbox account email mismatch: You authorized with ${usage.userEmail}, but your CloudFusion account is registered to ${userRecord.email}. Please link the Dropbox account matching your registered email.`;
            if (isMobile) {
              res.send(renderOAuthErrorHtml('Dropbox', errorMsg));
              return;
            }
            res.redirect(`${clientUrl}/dashboard?error=${encodeURIComponent(errorMsg)}`);
            return;
          }
        }

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
        invalidateQuotaCache(userId);
      } else {
        process.env.DROPBOX_ACCESS_TOKEN = tokenResult.accessToken;
        saveEnvVariable('DROPBOX_ACCESS_TOKEN', tokenResult.accessToken);
        if (tokenResult.refreshToken) {
          process.env.DROPBOX_REFRESH_TOKEN = tokenResult.refreshToken;
          saveEnvVariable('DROPBOX_REFRESH_TOKEN', tokenResult.refreshToken);
        }
      }

      if (isMobile) {
        res.send(renderOAuthSuccessHtml('Dropbox', 'DROPBOX'));
        return;
      }
      res.redirect(`${clientUrl}/dashboard?connected=dropbox`);
    } else {
      if (isMobile) {
        res.send(renderOAuthErrorHtml('Dropbox', 'Failed to retrieve access token from Dropbox.'));
        return;
      }
      res.redirect(`${clientUrl}/dashboard?error=dropbox_auth_failed`);
    }
  } catch (e) {
    console.error('Dropbox OAuth callback error:', e);
    res.redirect('http://localhost:3000/dashboard?error=dropbox_server_error');
  }
}

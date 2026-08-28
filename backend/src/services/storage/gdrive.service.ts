import https from 'https';
import querystring from 'querystring';

export interface GDriveStorageUsage {
  provider: 'GOOGLE_DRIVE';
  totalBytes: bigint;
  usedBytes: bigint;
  freeBytes: bigint;
  isConnected: boolean;
  userEmail?: string;
  userName?: string;
}

export interface GDriveUserCredentials {
  refreshToken?: string;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export function getGDriveAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' ');

  const queryObj: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
  };
  if (state) {
    queryObj.state = state;
  }

  return `${GOOGLE_AUTH_URL}?${querystring.stringify(queryObj)}`;
}

export function getAccessToken(credentials?: GDriveUserCredentials): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = credentials?.refreshToken || process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken || refreshToken.includes('placeholder')) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const postData = querystring.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const req = https.request(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.access_token || null);
          } catch (e) {
            resolve(null);
          }
        });
      }
    );

    req.on('error', (err) => {
      console.warn('Google Access Token Error:', err);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

function fetchDriveAbout(accessToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota,user',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

export async function getGDriveStorageUsage(credentials?: GDriveUserCredentials): Promise<GDriveStorageUsage> {
  const DEFAULT_GDRIVE_FREE_TIER = BigInt(16106127360); // 15 GB Fallback

  try {
    const accessToken = await getAccessToken(credentials);
    if (!accessToken) {
      const isConnected = !!(
        credentials?.refreshToken ||
        (process.env.GOOGLE_REFRESH_TOKEN && !process.env.GOOGLE_REFRESH_TOKEN.includes('placeholder'))
      );
      return {
        provider: 'GOOGLE_DRIVE',
        totalBytes: DEFAULT_GDRIVE_FREE_TIER,
        usedBytes: BigInt(0),
        freeBytes: DEFAULT_GDRIVE_FREE_TIER,
        isConnected,
      };
    }

    const aboutData = await fetchDriveAbout(accessToken);
    if (aboutData && aboutData.storageQuota) {
      const limit = aboutData.storageQuota.limit ? BigInt(aboutData.storageQuota.limit) : DEFAULT_GDRIVE_FREE_TIER;
      const usage = aboutData.storageQuota.usage ? BigInt(aboutData.storageQuota.usage) : BigInt(0);
      const free = limit - usage > BigInt(0) ? limit - usage : BigInt(0);

      return {
        provider: 'GOOGLE_DRIVE',
        totalBytes: limit,
        usedBytes: usage,
        freeBytes: free,
        isConnected: true,
        userEmail: aboutData.user?.emailAddress,
        userName: aboutData.user?.displayName,
      };
    }
  } catch (error) {
    console.warn('Google Drive Live Quota Error:', error);
  }

  return {
    provider: 'GOOGLE_DRIVE',
    totalBytes: DEFAULT_GDRIVE_FREE_TIER,
    usedBytes: BigInt(0),
    freeBytes: DEFAULT_GDRIVE_FREE_TIER,
    isConnected: true,
  };
}

export async function uploadFileToGDrive(
  filename: string,
  mimeType: string,
  fileBuffer: Buffer,
  credentials?: GDriveUserCredentials
): Promise<{ id: string; name: string } | null> {
  try {
    const accessToken = await getAccessToken(credentials);
    if (!accessToken) return null;

    const boundary = '-------CloudFusionBoundary314159';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: filename,
      mimeType: mimeType || 'application/octet-stream',
    };

    const multipartRequestBody = Buffer.concat([
      Buffer.from(
        delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`
      ),
      fileBuffer,
      Buffer.from(closeDelimiter),
    ]);

    return new Promise((resolve) => {
      const req = https.request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary="${boundary}"`,
            'Content-Length': multipartRequestBody.length,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.id) {
                console.log(
                  `[Google Drive API] Live File Upload Succeeded! Remote ID: ${parsed.id}, Name: ${parsed.name}`
                );
                resolve({ id: parsed.id, name: parsed.name });
              } else {
                console.warn('[Google Drive API] Upload response:', parsed);
                resolve(null);
              }
            } catch (e) {
              resolve(null);
            }
          });
        }
      );

      req.on('error', (err) => {
        console.error('[Google Drive API] Upload error:', err);
        resolve(null);
      });

      req.write(multipartRequestBody);
      req.end();
    });
  } catch (err) {
    console.error('[Google Drive API] Error during upload:', err);
    return null;
  }
}

export async function downloadFileFromGDrive(
  remoteFileId: string,
  credentials?: GDriveUserCredentials
): Promise<Buffer | null> {
  try {
    const accessToken = await getAccessToken(credentials);
    if (!accessToken) return null;

    return new Promise((resolve) => {
      const req = https.request(
        `https://www.googleapis.com/drive/v3/files/${remoteFileId}?alt=media`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            console.warn(`[Google Drive API] Download failed with status: ${res.statusCode}`);
            resolve(null);
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            console.log(
              `[Google Drive API] Successfully downloaded encrypted file ${remoteFileId} (${buffer.length} bytes)`
            );
            resolve(buffer);
          });
        }
      );

      req.on('error', (err) => {
        console.error('[Google Drive API] Download error:', err);
        resolve(null);
      });

      req.end();
    });
  } catch (err) {
    console.error('[Google Drive API] Error during download:', err);
    return null;
  }
}

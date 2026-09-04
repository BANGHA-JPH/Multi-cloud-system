import https from 'https';
import querystring from 'querystring';
import { URL } from 'url';

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
      const rawLimit = aboutData.storageQuota.limit ? BigInt(aboutData.storageQuota.limit) : DEFAULT_GDRIVE_FREE_TIER;
      // Guarantee at least the standard 15 GB free tier (some scopes or Google accounts return a 5 GB partial quota)
      const limit = rawLimit < DEFAULT_GDRIVE_FREE_TIER ? DEFAULT_GDRIVE_FREE_TIER : rawLimit;
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

function initiateGDriveResumableSession(
  accessToken: string,
  filename: string,
  mimeType: string,
  contentLength: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      name: filename,
    });

    const req = https.request(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType || 'application/octet-stream',
          'X-Upload-Content-Length': contentLength.toString(),
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        if ((res.statusCode === 200 || res.statusCode === 201) && res.headers.location) {
          resolve(res.headers.location);
        } else {
          console.warn('[Google Drive API] Resumable session init failed with status:', res.statusCode);
          resolve(null);
        }
      }
    );

    req.on('error', (err) => {
      console.error('[Google Drive API] Resumable session init error:', err);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

function uploadToGDriveResumableSession(
  sessionUrl: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ id: string; name: string } | null> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(sessionUrl);
    const req = https.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'PUT',
        headers: {
          'Content-Length': fileBuffer.length,
          'Content-Type': mimeType || 'application/octet-stream',
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
                `[Google Drive API] Resumable File Upload Succeeded! Remote ID: ${parsed.id}, Name: ${parsed.name}`
              );
              resolve({ id: parsed.id, name: parsed.name });
            } else {
              console.warn('[Google Drive API] Resumable upload response:', parsed);
              resolve(null);
            }
          } catch (e) {
            console.error('[Google Drive API] Resumable upload parse error:', e);
            resolve(null);
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error('[Google Drive API] Resumable upload PUT error:', err);
      resolve(null);
    });

    req.write(fileBuffer);
    req.end();
  });
}

export async function uploadFileToGDrive(
  filename: string,
  mimeType: string,
  fileBuffer: Buffer,
  credentials?: GDriveUserCredentials
): Promise<{ id: string; name: string } | null> {
  try {
    const accessToken = await getAccessToken(credentials);
    if (!accessToken) {
      console.error('[Google Drive API] Cannot upload: No valid access token.');
      return null;
    }

    // For files > 5 MB, Google Drive requires the Resumable Upload protocol
    if (fileBuffer.length > 5 * 1024 * 1024) {
      console.log(
        `[Google Drive API] File size (${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB) > 5 MB. Initiating Resumable Upload Session.`
      );
      const sessionUrl = await initiateGDriveResumableSession(
        accessToken,
        filename,
        mimeType,
        fileBuffer.length
      );
      if (sessionUrl) {
        return await uploadToGDriveResumableSession(sessionUrl, fileBuffer, mimeType);
      }
      console.warn('[Google Drive API] Resumable session init failed, falling back to multipart.');
    }

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

function fetchBufferWithRedirect(urlStr: string, headers: Record<string, string>): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const req = https.request(
      urlStr,
      {
        method: 'GET',
        headers,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBufferWithRedirect(res.headers.location, {})
            .then(resolve)
            .catch(() => resolve(null));
          return;
        }

        if (res.statusCode !== 200) {
          console.warn(`[Google Drive API] Download failed with status code: ${res.statusCode}`);
          resolve(null);
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      }
    );

    req.on('error', (err) => {
      console.error('[Google Drive API] Download request error:', err);
      resolve(null);
    });

    req.end();
  });
}

export async function downloadFileFromGDrive(
  remoteFileId: string,
  credentials?: GDriveUserCredentials
): Promise<Buffer | null> {
  try {
    const accessToken = await getAccessToken(credentials);
    if (!accessToken) return null;

    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${remoteFileId}?alt=media`;
    const buffer = await fetchBufferWithRedirect(downloadUrl, {
      Authorization: `Bearer ${accessToken}`,
    });

    if (buffer) {
      console.log(
        `[Google Drive API] Successfully downloaded encrypted file ${remoteFileId} (${buffer.length} bytes)`
      );
    }
    return buffer;
  } catch (err) {
    console.error('[Google Drive API] Error during download:', err);
    return null;
  }
}

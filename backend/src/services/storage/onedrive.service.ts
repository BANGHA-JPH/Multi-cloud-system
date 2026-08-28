import https from 'https';
import querystring from 'querystring';
import { URL } from 'url';

export interface OneDriveStorageUsage {
  provider: 'ONEDRIVE';
  totalBytes: bigint;
  usedBytes: bigint;
  freeBytes: bigint;
  isConnected: boolean;
  userEmail?: string;
  userName?: string;
}

export interface OneDriveUserCredentials {
  refreshToken?: string;
}

const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Generate Microsoft OAuth2 authorization URL
 */
export function getOneDriveAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.ONEDRIVE_CLIENT_ID || '';
  const scopes = [
    'https://graph.microsoft.com/Files.ReadWrite',
    'https://graph.microsoft.com/User.Read',
    'offline_access',
  ].join(' ');

  const queryObj: Record<string, string> = {
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: scopes,
  };
  if (state) {
    queryObj.state = state;
  }

  return `${MICROSOFT_AUTH_URL}?${querystring.stringify(queryObj)}`;
}

/**
 * Exchange Authorization Code for Access & Refresh Tokens
 */
export async function exchangeOneDriveCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number } | null> {
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  return new Promise((resolve) => {
    const postData = querystring.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const req = https.request(
      MICROSOFT_TOKEN_URL,
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
            if (parsed.access_token) {
              resolve({
                accessToken: parsed.access_token,
                refreshToken: parsed.refresh_token,
                expiresIn: parsed.expires_in,
              });
            } else {
              console.warn('[OneDrive OAuth] Exchange failed:', parsed);
              resolve(null);
            }
          } catch (e) {
            console.error('[OneDrive OAuth] Parse error:', e);
            resolve(null);
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error('[OneDrive OAuth] Token exchange request error:', err);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Retrieve fresh Access Token using Refresh Token
 */
export async function getOneDriveAccessToken(credentials?: OneDriveUserCredentials): Promise<string | null> {
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
  const refreshToken = credentials?.refreshToken || process.env.ONEDRIVE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken || clientId.includes('placeholder')) {
    return null;
  }

  return new Promise((resolve) => {
    const postData = querystring.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Files.ReadWrite https://graph.microsoft.com/User.Read offline_access',
    });

    const req = https.request(
      MICROSOFT_TOKEN_URL,
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
            if (parsed.access_token) {
              resolve(parsed.access_token);
            } else {
              console.warn('[OneDrive OAuth] Token refresh error response:', parsed);
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      }
    );

    req.on('error', (err) => {
      console.warn('[OneDrive OAuth] Refresh request failed:', err);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Query Microsoft Graph API for Live Drive Quota & User Info
 */
export async function getOneDriveStorageUsage(credentials?: OneDriveUserCredentials): Promise<OneDriveStorageUsage> {
  const DEFAULT_ONEDRIVE_FREE_TIER = BigInt(5368709120); // 5 GB Free Tier

  try {
    const accessToken = await getOneDriveAccessToken(credentials);
    if (!accessToken) {
      const isConnected = !!(credentials?.refreshToken || process.env.ONEDRIVE_REFRESH_TOKEN);
      return {
        provider: 'ONEDRIVE',
        totalBytes: DEFAULT_ONEDRIVE_FREE_TIER,
        usedBytes: BigInt(0),
        freeBytes: DEFAULT_ONEDRIVE_FREE_TIER,
        isConnected,
      };
    }

    return new Promise((resolve) => {
      const req = https.request(
        `${GRAPH_API_BASE}/me/drive`,
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
              const driveData = JSON.parse(data);
              if (driveData && driveData.quota) {
                const total = driveData.quota.total ? BigInt(driveData.quota.total) : DEFAULT_ONEDRIVE_FREE_TIER;
                const used = driveData.quota.used ? BigInt(driveData.quota.used) : BigInt(0);
                const free = driveData.quota.remaining
                  ? BigInt(driveData.quota.remaining)
                  : total - used > BigInt(0)
                  ? total - used
                  : BigInt(0);

                const userName = driveData.owner?.user?.displayName;
                const userEmail = driveData.owner?.user?.email || driveData.owner?.user?.userPrincipalName;

                resolve({
                  provider: 'ONEDRIVE',
                  totalBytes: total,
                  usedBytes: used,
                  freeBytes: free,
                  isConnected: true,
                  userName,
                  userEmail,
                });
              } else {
                resolve({
                  provider: 'ONEDRIVE',
                  totalBytes: DEFAULT_ONEDRIVE_FREE_TIER,
                  usedBytes: BigInt(0),
                  freeBytes: DEFAULT_ONEDRIVE_FREE_TIER,
                  isConnected: true,
                });
              }
            } catch (e) {
              resolve({
                provider: 'ONEDRIVE',
                totalBytes: DEFAULT_ONEDRIVE_FREE_TIER,
                usedBytes: BigInt(0),
                freeBytes: DEFAULT_ONEDRIVE_FREE_TIER,
                isConnected: true,
              });
            }
          });
        }
      );

      req.on('error', () => {
        resolve({
          provider: 'ONEDRIVE',
          totalBytes: DEFAULT_ONEDRIVE_FREE_TIER,
          usedBytes: BigInt(0),
          freeBytes: DEFAULT_ONEDRIVE_FREE_TIER,
          isConnected: true,
        });
      });

      req.end();
    });
  } catch (err) {
    console.warn('[OneDrive Service] Live quota fetch error:', err);
    return {
      provider: 'ONEDRIVE',
      totalBytes: DEFAULT_ONEDRIVE_FREE_TIER,
      usedBytes: BigInt(0),
      freeBytes: DEFAULT_ONEDRIVE_FREE_TIER,
      isConnected: true,
    };
  }
}

/**
 * Upload Encrypted File Buffer to Microsoft OneDrive via Microsoft Graph API
 */
export async function uploadFileToOneDrive(
  filename: string,
  _mimeType: string,
  fileBuffer: Buffer,
  credentials?: OneDriveUserCredentials
): Promise<{ id: string; name: string } | null> {
  try {
    const accessToken = await getOneDriveAccessToken(credentials);
    if (!accessToken) return null;

    const safeFilename = encodeURIComponent(filename);
    const uploadPath = `/me/drive/root:/CloudFusion/${safeFilename}:/content`;

    return new Promise((resolve) => {
      const req = https.request(
        `${GRAPH_API_BASE}${uploadPath}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
            'Content-Length': fileBuffer.length,
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
                  `[OneDrive API] Live File Upload Succeeded! Remote ID: ${parsed.id}, Name: ${parsed.name}`
                );
                resolve({ id: parsed.id, name: parsed.name });
              } else {
                console.warn('[OneDrive API] Upload response error:', parsed);
                resolve(null);
              }
            } catch (e) {
              console.error('[OneDrive API] Upload parse error:', e);
              resolve(null);
            }
          });
        }
      );

      req.on('error', (err) => {
        console.error('[OneDrive API] Upload request error:', err);
        resolve(null);
      });

      req.write(fileBuffer);
      req.end();
    });
  } catch (err) {
    console.error('[OneDrive API] Error during file upload:', err);
    return null;
  }
}

/**
 * Helper to fetch buffer following HTTP 302 redirects
 */
function fetchBufferWithRedirect(urlStr: string, headers: Record<string, string>): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(urlStr);
    const client = parsedUrl.protocol === 'https:' ? https : https;

    const req = client.request(
      urlStr,
      {
        method: 'GET',
        headers,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect (Microsoft Graph redirects to content download URL on Azure CDN)
          fetchBufferWithRedirect(res.headers.location, {})
            .then(resolve)
            .catch(() => resolve(null));
          return;
        }

        if (res.statusCode !== 200) {
          console.warn(`[OneDrive API] Download failed with status code: ${res.statusCode}`);
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
      console.error('[OneDrive API] Download request error:', err);
      resolve(null);
    });

    req.end();
  });
}

/**
 * Download Encrypted File Buffer from Microsoft OneDrive via Microsoft Graph API
 */
export async function downloadFileFromOneDrive(
  remoteFileId: string,
  credentials?: OneDriveUserCredentials
): Promise<Buffer | null> {
  try {
    const accessToken = await getOneDriveAccessToken(credentials);
    if (!accessToken) return null;

    const downloadUrl = `${GRAPH_API_BASE}/me/drive/items/${remoteFileId}/content`;
    const buffer = await fetchBufferWithRedirect(downloadUrl, {
      Authorization: `Bearer ${accessToken}`,
    });

    if (buffer) {
      console.log(
        `[OneDrive API] Successfully downloaded encrypted file ${remoteFileId} (${buffer.length} bytes)`
      );
    }
    return buffer;
  } catch (err) {
    console.error('[OneDrive API] Error during file download:', err);
    return null;
  }
}

import https from 'https';
import querystring from 'querystring';
import { Dropbox } from 'dropbox';
import dotenv from 'dotenv';

dotenv.config();

export interface DropboxStorageUsage {
  provider: 'DROPBOX';
  totalBytes: bigint;
  usedBytes: bigint;
  freeBytes: bigint;
  isConnected: boolean;
  userEmail?: string;
  userName?: string;
}

export interface DropboxUserCredentials {
  refreshToken?: string;
  accessToken?: string;
}

const DROPBOX_AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

function getAppKey(): string {
  if (process.env.DROPBOX_APP_KEY && !process.env.DROPBOX_APP_KEY.includes('your_')) {
    return process.env.DROPBOX_APP_KEY;
  }
  if (process.env.DROPBOX_CLIENT_ID && !process.env.DROPBOX_CLIENT_ID.includes('your_')) {
    return process.env.DROPBOX_CLIENT_ID;
  }
  dotenv.config();
  return process.env.DROPBOX_APP_KEY || process.env.DROPBOX_CLIENT_ID || 'tjny8hhrleus7ym';
}

function getAppSecret(): string {
  if (process.env.DROPBOX_APP_SECRET && !process.env.DROPBOX_APP_SECRET.includes('your_')) {
    return process.env.DROPBOX_APP_SECRET;
  }
  if (process.env.DROPBOX_CLIENT_SECRET && !process.env.DROPBOX_CLIENT_SECRET.includes('your_')) {
    return process.env.DROPBOX_CLIENT_SECRET;
  }
  dotenv.config();
  return process.env.DROPBOX_APP_SECRET || process.env.DROPBOX_CLIENT_SECRET || '3a5ama8twzo29a4';
}

/**
 * Generate Dropbox OAuth2 authorization URL with offline refresh token capability
 */
export function getDropboxAuthUrl(redirectUri: string, state?: string): string {
  const appKey = getAppKey();
  const queryObj: Record<string, string> = {
    client_id: appKey,
    response_type: 'code',
    token_access_type: 'offline',
    redirect_uri: redirectUri,
  };
  if (state) {
    queryObj.state = state;
  }

  return `${DROPBOX_AUTH_URL}?${querystring.stringify(queryObj)}`;
}

/**
 * Exchange Dropbox Authorization Code for Access and Refresh Tokens
 */
export async function exchangeDropboxCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number } | null> {
  const appKey = getAppKey();
  const appSecret = getAppSecret();

  if (!appKey || !appSecret) {
    console.error('[Dropbox OAuth] Missing DROPBOX_APP_KEY or DROPBOX_APP_SECRET');
    return null;
  }

  return new Promise((resolve) => {
    const postData = querystring.stringify({
      code,
      grant_type: 'authorization_code',
      client_id: appKey,
      client_secret: appSecret,
      redirect_uri: redirectUri,
    });

    const req = https.request(
      DROPBOX_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.access_token) {
              cachedAccessToken = parsed.access_token;
              tokenExpiresAt = Date.now() + (parsed.expires_in || 14400) * 1000 - 60000;
              resolve({
                accessToken: parsed.access_token,
                refreshToken: parsed.refresh_token,
                expiresIn: parsed.expires_in,
              });
            } else {
              console.warn('[Dropbox OAuth] Token exchange error response:', parsed);
              resolve(null);
            }
          } catch (e) {
            console.error('[Dropbox OAuth] Token exchange parse error:', e);
            resolve(null);
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error('[Dropbox OAuth] Token exchange HTTP error:', err);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Get active Dropbox Access Token, refreshing automatically if refresh token is present
 */
export async function getDropboxAccessToken(credentials?: DropboxUserCredentials): Promise<string | null> {
  const refreshToken = credentials?.refreshToken || process.env.DROPBOX_REFRESH_TOKEN;
  const appKey = getAppKey();
  const appSecret = getAppSecret();

  // If refresh token is available, obtain a fresh access token
  if (refreshToken && appKey && appSecret) {
    const refreshed = await new Promise<string | null>((resolve) => {
      const postData = querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: appKey,
        client_secret: appSecret,
      });

      const req = https.request(
        DROPBOX_TOKEN_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.access_token) {
                resolve(parsed.access_token);
              } else {
                console.warn('[Dropbox OAuth] Refresh token request failed:', parsed);
                resolve(null);
              }
            } catch (e) {
              console.error('[Dropbox OAuth] Refresh token parse error:', e);
              resolve(null);
            }
          });
        }
      );

      req.on('error', (err) => {
        console.error('[Dropbox OAuth] Refresh token HTTP error:', err);
        resolve(null);
      });

      req.write(postData);
      req.end();
    });

    if (refreshed) return refreshed;
  }

  // If direct accessToken provided
  if (credentials?.accessToken) {
    return credentials.accessToken;
  }

  // Fallback to static DROPBOX_ACCESS_TOKEN
  const staticToken = process.env.DROPBOX_ACCESS_TOKEN;
  if (staticToken && !staticToken.includes('placeholder') && !staticToken.includes('your_')) {
    return staticToken;
  }

  return null;
}

/**
 * Get Dropbox SDK client instance
 */
export async function getDropboxClient(credentials?: DropboxUserCredentials): Promise<Dropbox | null> {
  const token = await getDropboxAccessToken(credentials);
  if (!token) return null;
  return new Dropbox({ accessToken: token });
}

/**
 * Get real-time space usage & account details from Dropbox API
 */
export async function getDropboxStorageUsage(credentials?: DropboxUserCredentials): Promise<DropboxStorageUsage> {
  const DEFAULT_DROPBOX_FREE_TIER = BigInt(2147483648); // 2 GB Free Tier

  try {
    const dbx = await getDropboxClient(credentials);
    if (!dbx) {
      const isConnected = !!(
        credentials?.refreshToken ||
        credentials?.accessToken ||
        process.env.DROPBOX_REFRESH_TOKEN ||
        (process.env.DROPBOX_ACCESS_TOKEN && !process.env.DROPBOX_ACCESS_TOKEN.includes('placeholder'))
      );
      return {
        provider: 'DROPBOX',
        totalBytes: DEFAULT_DROPBOX_FREE_TIER,
        usedBytes: BigInt(0),
        freeBytes: DEFAULT_DROPBOX_FREE_TIER,
        isConnected,
      };
    }

    // Fetch space usage and account profile concurrently
    const [spaceRes, accountRes] = await Promise.allSettled([
      dbx.usersGetSpaceUsage(),
      dbx.usersGetCurrentAccount(),
    ]);

    let totalBytes = DEFAULT_DROPBOX_FREE_TIER;
    let usedBytes = BigInt(0);
    let userName: string | undefined;
    let userEmail: string | undefined;

    if (spaceRes.status === 'fulfilled' && spaceRes.value.result) {
      const space = spaceRes.value.result;
      const allocated = (space.allocation as any)?.individual?.allocated;
      if (allocated) {
        totalBytes = BigInt(allocated);
      }
      if (space.used !== undefined) {
        usedBytes = BigInt(space.used);
      }
    }

    if (accountRes.status === 'fulfilled' && accountRes.value.result) {
      const account = accountRes.value.result;
      userName = account.name?.display_name;
      userEmail = account.email;
    }

    const freeBytes = totalBytes - usedBytes > BigInt(0) ? totalBytes - usedBytes : BigInt(0);

    return {
      provider: 'DROPBOX',
      totalBytes,
      usedBytes,
      freeBytes,
      isConnected: true,
      userName,
      userEmail,
    };
  } catch (error) {
    console.warn('[Dropbox Service] Quota fetch error notice:', error);
    return {
      provider: 'DROPBOX',
      totalBytes: DEFAULT_DROPBOX_FREE_TIER,
      usedBytes: BigInt(0),
      freeBytes: DEFAULT_DROPBOX_FREE_TIER,
      isConnected: true,
    };
  }
}

async function uploadToDropboxSessionInChunks(
  dbx: any,
  dropboxPath: string,
  fileBuffer: Buffer
): Promise<{ id: string; name: string; path: string } | null> {
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB chunks
  const totalLength = fileBuffer.length;

  const firstChunk = fileBuffer.subarray(0, Math.min(CHUNK_SIZE, totalLength));
  const startRes = await dbx.filesUploadSessionStart({
    close: false,
    contents: firstChunk,
  });

  const sessionId = startRes.result.session_id;
  let offset = firstChunk.length;

  while (offset < totalLength) {
    const nextEnd = Math.min(offset + CHUNK_SIZE, totalLength);
    const chunk = fileBuffer.subarray(offset, nextEnd);

    if (nextEnd === totalLength) {
      const finishRes = await dbx.filesUploadSessionFinish({
        cursor: {
          session_id: sessionId,
          offset: offset,
        },
        commit: {
          path: dropboxPath,
          mode: { '.tag': 'overwrite' },
          autorename: false,
          mute: false,
        },
        contents: chunk,
      });

      if (finishRes && finishRes.result) {
        console.log(
          `[Dropbox API] Large Session Upload Succeeded! Remote ID: ${finishRes.result.id}, Path: ${finishRes.result.path_display}`
        );
        return {
          id: finishRes.result.id || finishRes.result.path_lower || dropboxPath,
          name: finishRes.result.name,
          path: finishRes.result.path_display || dropboxPath,
        };
      }
    } else {
      await dbx.filesUploadSessionAppendV2({
        cursor: {
          session_id: sessionId,
          offset: offset,
        },
        close: false,
        contents: chunk,
      });
    }

    offset = nextEnd;
  }

  return null;
}

/**
 * Upload Encrypted File Buffer to Dropbox
 */
export async function uploadFileToDropbox(
  filename: string,
  _mimeType: string,
  fileBuffer: Buffer,
  credentials?: DropboxUserCredentials
): Promise<{ id: string; name: string; path: string } | null> {
  try {
    const dbx = await getDropboxClient(credentials);
    if (!dbx) {
      console.warn('[Dropbox Service] Cannot upload: Dropbox client not authenticated.');
      return null;
    }

    const safeFilename = filename.replace(/[\\/:*?"<>|]/g, '_');
    const dropboxPath = `/CloudFusion/${safeFilename}`;

    // For files > 150 MB, Dropbox requires upload sessions
    if (fileBuffer.length > 150 * 1024 * 1024) {
      console.log(
        `[Dropbox API] File size (${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB) > 150 MB. Using Dropbox Upload Session.`
      );
      return await uploadToDropboxSessionInChunks(dbx, dropboxPath, fileBuffer);
    }

    const res = await dbx.filesUpload({
      path: dropboxPath,
      contents: fileBuffer,
      mode: { '.tag': 'overwrite' },
      autorename: false,
      mute: false,
    });

    if (res && res.result) {
      console.log(
        `[Dropbox API] Live File Upload Succeeded! Remote ID: ${res.result.id}, Path: ${res.result.path_display}`
      );
      return {
        id: res.result.id || res.result.path_lower || dropboxPath,
        name: res.result.name,
        path: res.result.path_display || dropboxPath,
      };
    }

    return null;
  } catch (err) {
    console.error('[Dropbox API] Error during file upload:', err);
    return null;
  }
}

/**
 * Download Encrypted File Buffer from Dropbox
 */
export async function downloadFileFromDropbox(
  remoteFileIdOrPath: string,
  credentials?: DropboxUserCredentials
): Promise<Buffer | null> {
  try {
    const dbx = await getDropboxClient(credentials);
    if (!dbx) {
      console.warn('[Dropbox Service] Cannot download: Dropbox client not authenticated.');
      return null;
    }

    const res = await dbx.filesDownload({ path: remoteFileIdOrPath });
    if (res && res.result) {
      const fileBinary = (res.result as any).fileBinary;
      if (Buffer.isBuffer(fileBinary)) {
        return fileBinary;
      }
      if (fileBinary) {
        return Buffer.from(fileBinary);
      }
    }

    console.warn(`[Dropbox API] Download returned empty payload for ${remoteFileIdOrPath}`);
    return null;
  } catch (err) {
    console.error('[Dropbox API] Error during file download:', err);
    return null;
  }
}

/**
 * Delete File from Dropbox
 */
export async function deleteFileFromDropbox(
  remoteFileIdOrPath: string,
  credentials?: DropboxUserCredentials
): Promise<boolean> {
  try {
    const dbx = await getDropboxClient(credentials);
    if (!dbx) return false;

    await dbx.filesDeleteV2({ path: remoteFileIdOrPath });
    return true;
  } catch (err) {
    console.error('[Dropbox API] Error deleting file:', err);
    return false;
  }
}

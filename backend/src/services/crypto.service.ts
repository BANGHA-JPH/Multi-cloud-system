import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get 32-byte encryption key from environment or fallback hash
 */
export function getMasterKey(): Buffer {
  const masterSecret = process.env.ENCRYPTION_MASTER_KEY || 'cloudfusion_default_master_security_key_32_bytes!';
  return crypto.createHash('sha256').update(masterSecret).digest();
}

export interface EncryptedData {
  encryptedBuffer: Buffer;
  iv: string; // Hex string
  authTag: string; // Hex string
  sha256Hash: string; // Hex checksum
}

/**
 * Encrypt buffer data using AES-256-GCM and compute SHA-256 checksum
 */
export function encryptFileBuffer(buffer: Buffer): EncryptedData {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getMasterKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encryptedBuffer = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const sha256Hash = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    encryptedBuffer,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    sha256Hash,
  };
}

/**
 * Decrypt buffer data using AES-256-GCM with IV and Auth Tag
 */
export function decryptFileBuffer(
  encryptedBuffer: Buffer,
  ivHex: string,
  authTagHex: string
): Buffer {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getMasterKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

/**
 * Compute SHA-256 hash of a file buffer
 */
export function computeSHA256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

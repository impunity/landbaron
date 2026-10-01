import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const SOLAREDGE_API_BASE_URL = 'https://monitoringapi.solaredge.com/v2';
export const SOLAREDGE_AUTHORIZE_URL = 'https://connect.solaredge.com/authorize';
export const SOLAREDGE_TOKEN_URL = `${SOLAREDGE_API_BASE_URL}/oauth2/token`;
export const SOLAREDGE_SCOPES = 'SITE_DATA DEVICE_DATA';

function getEncryptionKey() {
  const encodedKey = process.env.SOLAREDGE_ENCRYPTION_KEY?.trim();
  if (!encodedKey) throw new Error('SOLAREDGE_ENCRYPTION_KEY is not configured.');
  const key = /^[a-f\d]{64}$/i.test(encodedKey)
    ? Buffer.from(encodedKey, 'hex')
    : Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw new Error('SOLAREDGE_ENCRYPTION_KEY must encode exactly 32 bytes.');
  return key;
}

export function isSolarEncryptionConfigured() {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSolarSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptSolarSecret(value: string) {
  const [encodedIv, encodedTag, encodedCiphertext] = value.split('.');
  if (!encodedIv || !encodedTag || !encodedCiphertext) throw new Error('Stored SolarEdge credential is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
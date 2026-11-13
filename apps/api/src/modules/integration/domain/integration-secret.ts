import crypto from 'node:crypto';
import { IntegrationSecretInvalidError } from './integration-errors.js';

export interface GeneratedSecretResult {
  readonly secret: string;
  readonly secretHash: string;
  readonly encryptedSecret: string;
  readonly keyVersion: number;
}

export function generateRawSecret(): string {
  return 'whsec_' + crypto.randomBytes(32).toString('hex');
}

export const generateIntegrationSecret = generateRawSecret;

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export const computeSecretSha256 = hashSecret;

export function verifySecretHash(secret: string, secretHash: string): boolean {
  const computed = hashSecret(secret);
  if (computed.length !== secretHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(secretHash));
}

/**
 * Encrypt a plaintext secret using AES-256-GCM.
 * Output format: `v{keyVersion}:{ivHex}:{authTagHex}:{ciphertextHex}`
 */
export function encryptSecret(plaintext: string, masterKey: string, keyVersion = 1): string {
  const keyBuffer = deriveKey(masterKey);
  const iv = crypto.randomBytes(12); // standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `v${keyVersion}:${iv.toString('hex')}:${authTag}:${ciphertext}`;
}

/**
 * Decrypt a ciphertext produced by encryptSecret using AES-256-GCM.
 */
export function decryptSecret(encrypted: string, masterKey: string): string {
  try {
    const parts = encrypted.split(':');
    if (parts.length !== 4) {
      throw new Error('Malformed encrypted secret format');
    }
    const [, ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex!, 'hex');
    const authTag = Buffer.from(authTagHex!, 'hex');
    const keyBuffer = deriveKey(masterKey);

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex!, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new IntegrationSecretInvalidError(`Failed to decrypt secret: ${msg}`);
  }
}

function deriveKey(masterKey: string): Buffer {
  // Ensure exactly 32 bytes for AES-256
  return crypto.createHash('sha256').update(masterKey).digest();
}

export function encryptIntegrationSecret(
  plaintext: string,
  masterKey: string,
  keyVersion = 1,
): { encryptedSecret: string; keyVersion: number; secretHash: string } {
  const encryptedSecret = encryptSecret(plaintext, masterKey, keyVersion);
  const secretHash = hashSecret(plaintext);
  return { encryptedSecret, keyVersion, secretHash };
}

export const decryptIntegrationSecret = decryptSecret;

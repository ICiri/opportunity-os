import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';

const AES_ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export type EncryptedEnvelope = {
  ciphertext: Buffer;
  nonce: Buffer;
  aadHash: string;
};

export function decodeDataKey(base64Secret: string): Buffer {
  const key = Buffer.from(base64Secret, 'base64');
  if (key.length !== 32) throw new Error('Opportunity data key must decode to exactly 32 bytes.');
  return key;
}

export function hashAad(aad: string): string {
  return createHash('sha256').update(aad, 'utf8').digest('hex');
}

export function encryptBytes(plaintext: Buffer, key: Buffer, aad: string): EncryptedEnvelope {
  if (key.length !== 32) throw new Error('AES-256-GCM requires a 32-byte key.');
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, nonce);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]),
    nonce,
    aadHash: hashAad(aad),
  };
}

export function decryptBytes(envelope: EncryptedEnvelope, key: Buffer, aad: string): Buffer {
  if (key.length !== 32) throw new Error('AES-256-GCM requires a 32-byte key.');
  if (envelope.nonce.length !== NONCE_BYTES) throw new Error('Invalid AES-GCM nonce length.');
  if (envelope.aadHash !== hashAad(aad)) throw new Error('Encrypted payload context does not match.');
  if (envelope.ciphertext.length < AUTH_TAG_BYTES) throw new Error('Encrypted payload is truncated.');

  const encrypted = envelope.ciphertext.subarray(0, -AUTH_TAG_BYTES);
  const authTag = envelope.ciphertext.subarray(-AUTH_TAG_BYTES);
  const decipher = createDecipheriv(AES_ALGORITHM, key, envelope.nonce);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function encryptText(plaintext: string, key: Buffer, aad: string): EncryptedEnvelope {
  return encryptBytes(Buffer.from(plaintext, 'utf8'), key, aad);
}

export function decryptText(envelope: EncryptedEnvelope, key: Buffer, aad: string): string {
  return decryptBytes(envelope, key, aad).toString('utf8');
}

export const gmailPayloadAad = (userId: string, messageId: string, field: 'subject' | 'body') =>
  `opportunity-os:gmail:v1:${userId}:${messageId}:${field}`;

export const cvPayloadAad = (userId: string, cvVersionId: string) =>
  `opportunity-os:cv:v1:${userId}:${cvVersionId}:document`;

export const aiPayloadAad = (userId: string, aiRunId: string, field: 'input' | 'output') =>
  `opportunity-os:ai:v1:${userId}:${aiRunId}:${field}`;

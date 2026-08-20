import {describe, expect, it} from 'vitest';
import {decodeDataKey, decryptBytes, decryptText, encryptBytes, encryptText} from '../src/lib/security/envelope';

describe('AES-256-GCM private payload envelope', () => {
  const key = decodeDataKey(Buffer.alloc(32, 7).toString('base64'));
  const aad = 'opportunity-os:test:user:message:body';

  it('round-trips without leaving plaintext in the ciphertext', () => {
    const plaintext = 'Private Gmail body canary 8d83bc';
    const encrypted = encryptText(plaintext, key, aad);
    expect(encrypted.nonce).toHaveLength(12);
    expect(encrypted.ciphertext.toString('utf8')).not.toContain(plaintext);
    expect(decryptText(encrypted, key, aad)).toBe(plaintext);
  });

  it('rejects changed AAD, nonce and ciphertext', () => {
    const encrypted = encryptText('private', key, aad);
    expect(() => decryptText(encrypted, key, `${aad}:other`)).toThrow();
    expect(() => decryptText({...encrypted, nonce: Buffer.alloc(12)}, key, aad)).toThrow();
    const changed = Buffer.from(encrypted.ciphertext);
    changed[0] ^= 1;
    expect(() => decryptText({...encrypted, ciphertext: changed}, key, aad)).toThrow();
  });

  it('rejects an invalid key length', () => {
    expect(() => decodeDataKey(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });

  it('round-trips a binary PDF payload', () => {
    const pdf = Buffer.from('%PDF-1.7\nprivate binary\u0000payload', 'utf8');
    const encrypted = encryptBytes(pdf, key, `${aad}:pdf`);
    expect(decryptBytes(encrypted, key, `${aad}:pdf`)).toEqual(pdf);
  });
});

import { randomBytes } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  __resetKeyCacheForTests,
  VAULT_CURRENT_KEY_VERSION,
  VaultError,
  decrypt,
  encrypt,
} from './vault.js';

describe('vault (AES-256-GCM)', () => {
  beforeEach(() => {
    __resetKeyCacheForTests();
  });

  it('round-trip encrypt → decrypt devuelve el mismo plaintext', () => {
    const plain = 'sk-ant-api03-muy-secreto-1234567890ABCDEF';
    const enc = encrypt(plain);

    expect(enc.keyVersion).toBe(VAULT_CURRENT_KEY_VERSION);
    expect(enc.iv).toHaveLength(12);
    expect(enc.authTag).toHaveLength(16);
    expect(enc.ciphertext.length).toBeGreaterThan(0);
    expect(enc.ciphertext.toString('utf8')).not.toContain(plain); // sanity

    expect(decrypt(enc)).toBe(plain);
  });

  it('dos encriptados del mismo plaintext producen IV y ciphertext distintos (no determinista)', () => {
    const plain = 'otro-secreto';
    const a = encrypt(plain);
    const b = encrypt(plain);

    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(decrypt(a)).toBe(plain);
    expect(decrypt(b)).toBe(plain);
  });

  it('tamper sobre ciphertext hace fallar el descifrado con VAULT_DECRYPT_FAILED', () => {
    const enc = encrypt('api-key-sensible');
    const tampered = { ...enc, ciphertext: Buffer.from(enc.ciphertext) };
    tampered.ciphertext[0] = (tampered.ciphertext[0]! ^ 0xff) & 0xff;

    expect(() => decrypt(tampered)).toThrowError(VaultError);
    try {
      decrypt(tampered);
    } catch (err) {
      expect((err as VaultError).code).toBe('VAULT_DECRYPT_FAILED');
    }
  });

  it('tamper sobre authTag hace fallar el descifrado', () => {
    const enc = encrypt('api-key-sensible');
    const tampered = { ...enc, authTag: Buffer.from(enc.authTag) };
    tampered.authTag[0] = (tampered.authTag[0]! ^ 0xff) & 0xff;

    expect(() => decrypt(tampered)).toThrowError(VaultError);
  });

  it('IV con longitud incorrecta se rechaza como VAULT_INVALID_INPUT', () => {
    const enc = encrypt('x');
    const bad = { ...enc, iv: randomBytes(8) }; // 8 != 12
    try {
      decrypt(bad);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VaultError);
      expect((err as VaultError).code).toBe('VAULT_INVALID_INPUT');
    }
  });

  it('keyVersion inexistente hace fallar descifrado con VAULT_DECRYPT_FAILED', () => {
    const enc = encrypt('abc');
    const bad = { ...enc, keyVersion: 99 };
    try {
      decrypt(bad);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VaultError);
      expect((err as VaultError).code).toBe('VAULT_DECRYPT_FAILED');
    }
  });

  it('plaintext vacío es rechazado por encrypt (VAULT_INVALID_INPUT)', () => {
    expect(() => encrypt('')).toThrowError(VaultError);
  });
});

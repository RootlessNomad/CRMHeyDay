// Credential vault — cifrado AES-256-GCM para secretos Level 3.
//
// Diseño:
// - `CREDENTIAL_MASTER_KEY` en env es base64 de 32 bytes (256 bits).
// - Cada secreto se cifra con un IV aleatorio de 96 bits (recomendación NIST
//   para GCM por su balance rendimiento/seguridad).
// - Se almacenan `ciphertext`, `iv`, `authTag` y `keyVersion`. El authTag de 128
//   bits detecta manipulación. `keyVersion` permite rotar la master key en el
//   futuro manteniendo descifrado de ciphertexts antiguos.
//
// v1 solo tiene `keyVersion = 1`. Para rotar la master key sin downtime:
//   - añadir `CREDENTIAL_MASTER_KEY_V2` a env,
//   - registrar en el mapa `KEYS`,
//   - re-cifrar cada credencial llamando a `reencryptToVersion`.
//
// Este módulo NO toca la DB. El servicio `modules/credentials` lo hace.

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm' as const;
const IV_BYTES = 12; // 96 bits — estándar recomendado para GCM
const AUTH_TAG_BYTES = 16; // 128 bits
const KEY_BYTES = 32; // 256 bits
const CURRENT_KEY_VERSION = 1 as const;

export class VaultError extends Error {
  readonly code: 'VAULT_MISCONFIGURED' | 'VAULT_DECRYPT_FAILED' | 'VAULT_INVALID_INPUT';
  constructor(
    code: 'VAULT_MISCONFIGURED' | 'VAULT_DECRYPT_FAILED' | 'VAULT_INVALID_INPUT',
    message: string,
  ) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}

export interface EncryptedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

// ---------------------------------------------------------------------
// Gestión de master keys por versión
// ---------------------------------------------------------------------

let keyCache: Map<number, Buffer> | null = null;

function loadKeys(): Map<number, Buffer> {
  if (keyCache) return keyCache;

  const raw = env.CREDENTIAL_MASTER_KEY;
  if (!raw) {
    throw new VaultError(
      'VAULT_MISCONFIGURED',
      'Falta CREDENTIAL_MASTER_KEY en el entorno. Generarla con: openssl rand -base64 32',
    );
  }

  const key = safeDecodeBase64(raw);
  if (key.length !== KEY_BYTES) {
    throw new VaultError(
      'VAULT_MISCONFIGURED',
      `CREDENTIAL_MASTER_KEY debe ser 32 bytes en base64; recibidos ${key.length}. Regenera con: openssl rand -base64 32`,
    );
  }

  const keys = new Map<number, Buffer>();
  keys.set(CURRENT_KEY_VERSION, key);
  keyCache = keys;
  return keys;
}

function safeDecodeBase64(raw: string): Buffer {
  // Node tolera base64url y base64 estándar con `base64` — suficiente.
  try {
    return Buffer.from(raw, 'base64');
  } catch {
    throw new VaultError('VAULT_MISCONFIGURED', 'CREDENTIAL_MASTER_KEY no es base64 válido');
  }
}

function keyForVersion(version: number): Buffer {
  const keys = loadKeys();
  const key = keys.get(version);
  if (!key) {
    throw new VaultError(
      'VAULT_DECRYPT_FAILED',
      `No hay master key para keyVersion ${version}. Rotación incompleta?`,
    );
  }
  return key;
}

// Solo para tests.
export function __resetKeyCacheForTests(): void {
  keyCache = null;
}

// ---------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------

export function encrypt(plaintext: string): EncryptedSecret {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new VaultError('VAULT_INVALID_INPUT', 'plaintext vacío');
  }
  const key = keyForVersion(CURRENT_KEY_VERSION);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  if (authTag.length !== AUTH_TAG_BYTES) {
    // Defensa: nunca debería pasar con aes-256-gcm.
    throw new VaultError('VAULT_MISCONFIGURED', 'authTag con longitud inesperada');
  }

  return { ciphertext, iv, authTag, keyVersion: CURRENT_KEY_VERSION };
}

export function decrypt(secret: EncryptedSecret): string {
  if (
    !Buffer.isBuffer(secret.ciphertext) ||
    !Buffer.isBuffer(secret.iv) ||
    !Buffer.isBuffer(secret.authTag) ||
    secret.iv.length !== IV_BYTES ||
    secret.authTag.length !== AUTH_TAG_BYTES
  ) {
    throw new VaultError('VAULT_INVALID_INPUT', 'secret con formato inválido');
  }

  const key = keyForVersion(secret.keyVersion);
  const decipher = createDecipheriv(ALGORITHM, key, secret.iv);
  decipher.setAuthTag(secret.authTag);

  try {
    const plain = Buffer.concat([decipher.update(secret.ciphertext), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    // Cualquier fallo de `final()` en GCM significa authTag inválido → tamper.
    throw new VaultError(
      'VAULT_DECRYPT_FAILED',
      'No se pudo descifrar la credencial (posible manipulación o clave incorrecta)',
    );
  }
}

/**
 * Re-cifra un secreto existente a la `keyVersion` actual.
 * Útil para rotación de master key.
 */
export function reencryptToCurrent(secret: EncryptedSecret): EncryptedSecret {
  if (secret.keyVersion === CURRENT_KEY_VERSION) return secret;
  const plain = decrypt(secret);
  return encrypt(plain);
}

/**
 * Compara dos secretos cifrados en tiempo constante (sobre el ciphertext).
 * Sólo útil para checks específicos; NO sustituye al descifrado.
 */
export function ciphertextEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const VAULT_CURRENT_KEY_VERSION = CURRENT_KEY_VERSION;

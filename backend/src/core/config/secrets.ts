// Resolución centralizada de secretos Level 2 + Level 3.
//
// Estrategia:
// 1. Si el valor está en `env` (Level 2 — ej. ANTHROPIC_API_KEY), se devuelve
//    directamente sin tocar la DB.
// 2. Si no, se busca en el Credential Vault (Level 3) por `key` y se descifra
//    on-demand.
// 3. Cache en memoria con TTL de 5 min para no descifrar en cada request.
//    El cache se invalida con `invalidateSecret(key)` tras rotar/desactivar.
//
// Reglas:
// - El plaintext NUNCA se escribe a logs ni se expone al cliente.
// - Si ni env ni vault tienen el secreto, se lanza `SecretNotConfiguredError`.

import { credentialsService, type CredentialsService } from '../../modules/credentials/service.js';
import { env, type Env } from './env.js';

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  value: string;
  expiresAt: number;
}

export class SecretNotConfiguredError extends Error {
  readonly code = 'SECRET_NOT_CONFIGURED';
  constructor(key: string) {
    super(`Falta configurar el secreto '${key}' (ni env ni vault).`);
    this.name = 'SecretNotConfiguredError';
  }
}

/**
 * Mapa explícito de secretos del vault → env var fallback.
 * Si la env var existe, tiene prioridad (permite overridear desde EasyPanel sin tocar DB).
 *
 * Mantener esta lista sincronizada con la taxonomía de credentials en admin.
 */
const ENV_FALLBACKS: Record<string, keyof Env | undefined> = {
  anthropic_primary: 'ANTHROPIC_API_KEY',
  // Level 3 puro (sin fallback en env):
  google_places: undefined,
  google_pagespeed: undefined,
  n8n_webhook_secret: undefined,
  airtable_pat: undefined,
  google_oauth_client_secret: undefined,
  meta_graph_token: undefined,
  linkedin_access_token: undefined,
  whatsapp_api_token: undefined,
};

export class SecretsResolver {
  private readonly creds: CredentialsService;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(creds: CredentialsService = credentialsService) {
    this.creds = creds;
  }

  async get(key: string): Promise<string> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    // 1. env fallback tiene prioridad.
    const envKey = ENV_FALLBACKS[key];
    if (envKey) {
      const fromEnv = env[envKey];
      if (typeof fromEnv === 'string' && fromEnv.length > 0) {
        this.cache.set(key, { value: fromEnv, expiresAt: Date.now() + TTL_MS });
        return fromEnv;
      }
    }

    // 2. vault.
    try {
      const plaintext = await this.creds.reveal(key);
      this.cache.set(key, { value: plaintext, expiresAt: Date.now() + TTL_MS });
      return plaintext;
    } catch {
      throw new SecretNotConfiguredError(key);
    }
  }

  /**
   * Mismo flujo que `get` pero devuelve null en lugar de lanzar.
   */
  async tryGet(key: string): Promise<string | null> {
    try {
      return await this.get(key);
    } catch {
      return null;
    }
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}

export const secretsResolver = new SecretsResolver();

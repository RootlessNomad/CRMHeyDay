// AnthropicClient — wrapper único para TODAS las llamadas a Claude.
//
// Responsabilidades:
// - Resuelve API key (env primero, vault después; lanza si ninguno).
// - Selecciona modelo por feature vía `FEATURE_MODEL_MAP`.
// - Aplica prompt caching: los `SystemBlock`s con `cache: true` llevan
//   `cache_control: {type: 'ephemeral'}` — cache hits reducen coste 10x y latencia.
// - Retry exponencial (3 intentos) para 429 / 5xx / timeouts.
// - Fallback automático al tier secundario si el primario sigue fallando.
// - Logging estructurado de `usage` (incluye cache_creation + cache_read) a `ai_usage_logs`
//   + cálculo de coste estimado.
// - Timeout configurable vía AbortController.
// - NUNCA loggea prompt, respuesta ni API key.

import Anthropic from '@anthropic-ai/sdk';
import type { AiFeature, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../prisma/client.js';
import { SecretNotConfiguredError, secretsResolver } from '../config/secrets.js';
import type { SecretsResolver } from '../config/secrets.js';
import { rootLogger } from '../observability/logger.js';
import type { Logger } from '../observability/logger.js';
import { AnthropicError } from './errors.js';
import { configForFeature, resolveModel } from './models.js';
import type { ModelTier } from './models.js';
import { estimateCostUsd } from './pricing.js';
import type { TokenCounts } from './pricing.js';

// ------------------------------------------------------------------
// Tipos públicos del API (no dependemos de los del SDK para evitar acoplamiento).
// ------------------------------------------------------------------

export interface SystemBlock {
  text: string;
  /** Si true → añade `cache_control: {type: 'ephemeral'}`. Usar en bloques reutilizables. */
  cache?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompleteInput {
  feature: AiFeature;
  /** Bloques de sistema en orden. Los reutilizables deben marcarse `cache: true`. */
  systemBlocks: SystemBlock[];
  messages: ChatMessage[];
  /** Override del maxTokens de `FEATURE_MODEL_MAP`. */
  maxTokens?: number;
  /** Override de temperatura. */
  temperature?: number;
  /** Tier forzado (tests o retry manual). */
  tierOverride?: ModelTier;
  // Context para el audit/usage log (todos opcionales).
  userId?: string;
  entityType?: string;
  entityId?: string;
  requestId?: string;
}

export interface CompleteResult {
  text: string;
  modelUsed: string;
  usage: TokenCounts;
  costUsd: number;
  /** Cuántos intentos tardó (incluye fallback). 1 = happy path. */
  attempts: number;
}

// ------------------------------------------------------------------
// Interfaz mínima del SDK para permitir mocks en tests sin importar el SDK entero.
// ------------------------------------------------------------------

interface AnthropicMessageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicMessageResponse {
  id: string;
  model: string;
  content: Array<AnthropicTextBlock | { type: string }>;
  usage: AnthropicMessageUsage;
  stop_reason?: string | null;
}

export interface AnthropicLike {
  messages: {
    create(
      params: Record<string, unknown>,
      opts?: { signal?: AbortSignal },
    ): Promise<AnthropicMessageResponse>;
  };
}

// ------------------------------------------------------------------
// Config por defecto
// ------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS_PRIMARY = 3;
const MAX_ATTEMPTS_FALLBACK = 2;
const BACKOFF_BASE_MS = 500;

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------

function isRetryableStatus(status: number | undefined): boolean {
  if (!status) return true; // error de red/timeout
  return status === 429 || (status >= 500 && status < 600);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractText(response: AnthropicMessageResponse): string {
  return response.content
    .filter((b): b is AnthropicTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

function extractUsage(response: AnthropicMessageResponse): TokenCounts {
  return {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
  };
}

function buildSystemParam(blocks: SystemBlock[]): Array<Record<string, unknown>> {
  return blocks.map((b) => ({
    type: 'text',
    text: b.text,
    ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}),
  }));
}

// ------------------------------------------------------------------
// Cliente principal
// ------------------------------------------------------------------

export interface AnthropicClientDeps {
  /** Factory que instancia el SDK real. Override en tests. */
  sdkFactory?: (apiKey: string) => AnthropicLike;
  secrets?: SecretsResolver;
  db?: PrismaClient;
  logger?: Logger;
  /** Timeout por request en ms. */
  timeoutMs?: number;
  /** Backoff base en ms (override en tests para acelerar). */
  backoffBaseMs?: number;
}

export class AnthropicClient {
  private readonly sdkFactory: (apiKey: string) => AnthropicLike;
  private readonly secrets: SecretsResolver;
  private readonly db: PrismaClient;
  private readonly log: Logger;
  private readonly timeoutMs: number;
  private readonly backoffBaseMs: number;
  private sdk: AnthropicLike | null = null;
  private sdkKeyFingerprint: string | null = null; // para invalidar al rotar

  constructor(deps: AnthropicClientDeps = {}) {
    // El SDK real de Anthropic devuelve tipos más específicos (overloads de
    // streaming, etc.) que el shape estructural `AnthropicLike` que usamos
    // internamente. Para tests inyectamos un fake; en runtime cast a
    // AnthropicLike es seguro porque sólo llamamos `messages.create` con
    // params planos.
    this.sdkFactory =
      deps.sdkFactory ?? ((apiKey) => new Anthropic({ apiKey }) as unknown as AnthropicLike);
    this.secrets = deps.secrets ?? secretsResolver;
    this.db = deps.db ?? defaultPrisma;
    this.log = deps.logger ?? rootLogger.child({ component: 'ai.anthropic' });
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.backoffBaseMs = deps.backoffBaseMs ?? BACKOFF_BASE_MS;
  }

  /** Completar una llamada Claude. Ver `CompleteInput`/`CompleteResult`. */
  async complete(input: CompleteInput): Promise<CompleteResult> {
    const cfg = configForFeature(input.feature);
    const primaryTier: ModelTier = input.tierOverride ?? cfg.primary;
    const fallbackTier: ModelTier | undefined = cfg.fallback;
    const maxTokens = input.maxTokens ?? cfg.maxTokens;
    const temperature = input.temperature ?? cfg.temperature ?? 0.3;

    const sdk = await this.ensureSdk();

    let totalAttempts = 0;

    // Intento con tier primario.
    try {
      const res = await this.callWithRetries(sdk, resolveModel(primaryTier), input, {
        maxTokens,
        temperature,
        maxAttempts: MAX_ATTEMPTS_PRIMARY,
      });
      totalAttempts += res.attempts;
      await this.logUsage(input, res.response, res.model, res.latencyMs).catch((err) => {
        // Si falla el log, seguimos — la llamada ya tuvo éxito.
        this.log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'ai_usage_log failed',
        );
      });
      return this.toResult(res.response, res.model, totalAttempts);
    } catch (err) {
      if (!fallbackTier || !(err instanceof AnthropicError) || !isRetryableStatus(err.status)) {
        if (err instanceof AnthropicError) throw err;
        throw new AnthropicError('AI_UNKNOWN', err instanceof Error ? err.message : String(err));
      }
      totalAttempts += err.attempts;
      this.log.warn(
        { feature: input.feature, status: err.status, primaryAttempts: err.attempts },
        'ai primary tier failed, falling back',
      );
    }

    // Fallback.
    const fbModel = resolveModel(fallbackTier!);
    try {
      const res = await this.callWithRetries(sdk, fbModel, input, {
        maxTokens,
        temperature,
        maxAttempts: MAX_ATTEMPTS_FALLBACK,
      });
      totalAttempts += res.attempts;
      await this.logUsage(input, res.response, res.model, res.latencyMs).catch(() => {});
      return this.toResult(res.response, res.model, totalAttempts);
    } catch (err) {
      if (err instanceof AnthropicError) {
        throw new AnthropicError(err.code, err.message, {
          ...(err.status !== undefined ? { status: err.status } : {}),
          attempts: totalAttempts + err.attempts,
        });
      }
      throw new AnthropicError('AI_UNKNOWN', err instanceof Error ? err.message : String(err), {
        attempts: totalAttempts + 1,
      });
    }
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private async ensureSdk(): Promise<AnthropicLike> {
    // Resolver key: vault primero si no hay env; env tiene prioridad via ENV_FALLBACKS.
    let apiKey: string;
    try {
      apiKey = await this.secrets.get('anthropic_primary');
    } catch (err) {
      if (err instanceof SecretNotConfiguredError) {
        throw new AnthropicError(
          'AI_NOT_CONFIGURED',
          'Anthropic API key no configurada (ni env ni vault)',
        );
      }
      throw err;
    }

    // Fingerprint simple para detectar rotación sin loggear la key.
    const fingerprint = `len:${apiKey.length}:suffix:${apiKey.slice(-4)}`;
    if (!this.sdk || this.sdkKeyFingerprint !== fingerprint) {
      this.sdk = this.sdkFactory(apiKey);
      this.sdkKeyFingerprint = fingerprint;
    }
    return this.sdk;
  }

  private async callWithRetries(
    sdk: AnthropicLike,
    model: string,
    input: CompleteInput,
    opts: { maxTokens: number; temperature: number; maxAttempts: number },
  ): Promise<{
    response: AnthropicMessageResponse;
    model: string;
    attempts: number;
    latencyMs: number;
  }> {
    const params: Record<string, unknown> = {
      model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: buildSystemParam(input.systemBlocks),
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    };

    let lastErr: AnthropicError | undefined;
    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const started = Date.now();
      try {
        const response = await sdk.messages.create(params, { signal: controller.signal });
        clearTimeout(timer);
        return { response, model, attempts: attempt, latencyMs: Date.now() - started };
      } catch (rawErr) {
        clearTimeout(timer);
        const latencyMs = Date.now() - started;
        const normalised = this.normaliseSdkError(rawErr, attempt);
        lastErr = normalised;

        const retryable = isRetryableStatus(normalised.status);
        const isLastAttempt = attempt === opts.maxAttempts;

        this.log.warn(
          {
            feature: input.feature,
            model,
            attempt,
            status: normalised.status,
            code: normalised.code,
            latencyMs,
            willRetry: retryable && !isLastAttempt,
          },
          'ai call failed',
        );

        if (!retryable || isLastAttempt) {
          throw new AnthropicError(normalised.code, normalised.message, {
            ...(normalised.status !== undefined ? { status: normalised.status } : {}),
            attempts: attempt,
          });
        }

        const backoff = this.backoffBaseMs * Math.pow(2, attempt - 1);
        await delay(backoff);
      }
    }
    // Unreachable, pero TS no lo infiere.
    throw lastErr ?? new AnthropicError('AI_UNKNOWN', 'exhausted retries');
  }

  private normaliseSdkError(err: unknown, attempt: number): AnthropicError {
    // Timeout → AbortError.
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
      return new AnthropicError('AI_TIMEOUT', 'request timed out', { attempts: attempt });
    }
    // SDK errors llevan `status`.
    const obj = err as { status?: number; message?: string; name?: string };
    const status = typeof obj.status === 'number' ? obj.status : undefined;
    const message = obj.message ?? 'unknown anthropic error';
    let code: AnthropicError['code'] = 'AI_UNKNOWN';
    if (status === 401 || status === 403) code = 'AI_AUTH_FAILED';
    else if (status === 400) code = 'AI_BAD_REQUEST';
    else if (status === 429) code = 'AI_RATE_LIMITED';
    else if (status && status >= 500) code = 'AI_SERVER_ERROR';
    return new AnthropicError(code, message, { status, attempts: attempt });
  }

  private toResult(
    response: AnthropicMessageResponse,
    model: string,
    attempts: number,
  ): CompleteResult {
    const usage = extractUsage(response);
    return {
      text: extractText(response),
      modelUsed: model,
      usage,
      costUsd: estimateCostUsd(model, usage),
      attempts,
    };
  }

  private async logUsage(
    input: CompleteInput,
    response: AnthropicMessageResponse,
    model: string,
    latencyMs: number,
  ): Promise<void> {
    const usage = extractUsage(response);
    const cost = estimateCostUsd(model, usage);
    await this.db.aiUsageLog.create({
      data: {
        feature: input.feature,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        estimatedCostUsd: cost,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        userId: input.userId ?? null,
        requestId: input.requestId ?? null,
        latencyMs,
      },
    });
  }
}

export const anthropicClient = new AnthropicClient();

import type { AiUsageLog, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub del SDK oficial — nunca se ejecuta porque siempre inyectamos `sdkFactory`
// en los tests, pero el import del cliente necesita resolverse.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = { create: vi.fn() };
  },
}));

import { SecretNotConfiguredError } from '../config/secrets.js';
import { AnthropicClient, type AnthropicLike } from './anthropic-client.js';

// ----- Fakes ---------------------------------------------------------------

interface UsageRow {
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  userId: string | null;
  entityType: string | null;
  entityId: string | null;
  requestId: string | null;
}

interface FakeDb {
  usages: UsageRow[];
}

function makePrisma(db: FakeDb): PrismaClient {
  const prisma = {
    aiUsageLog: {
      create: vi.fn(async ({ data }: { data: Partial<AiUsageLog> }) => {
        db.usages.push({
          feature: data.feature as string,
          model: data.model!,
          inputTokens: data.inputTokens!,
          outputTokens: data.outputTokens!,
          cacheCreationInputTokens: data.cacheCreationInputTokens ?? 0,
          cacheReadInputTokens: data.cacheReadInputTokens ?? 0,
          estimatedCostUsd: Number(data.estimatedCostUsd),
          latencyMs: data.latencyMs!,
          userId: data.userId ?? null,
          entityType: data.entityType ?? null,
          entityId: data.entityId ?? null,
          requestId: data.requestId ?? null,
        });
        return {} as AiUsageLog;
      }),
    },
  };
  return prisma as unknown as PrismaClient;
}

function makeSecrets(apiKey = 'sk-ant-test-123'): {
  get: ReturnType<typeof vi.fn>;
  tryGet: ReturnType<typeof vi.fn>;
  invalidate: ReturnType<typeof vi.fn>;
  invalidateAll: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(async () => apiKey),
    tryGet: vi.fn(async () => apiKey),
    invalidate: vi.fn(),
    invalidateAll: vi.fn(),
  };
}

function makeSdkOk(model = 'claude-sonnet-4-6'): {
  sdk: AnthropicLike;
  calls: Array<Record<string, unknown>>;
} {
  const calls: Array<Record<string, unknown>> = [];
  const sdk: AnthropicLike = {
    messages: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        calls.push(params);
        return {
          id: 'msg_1',
          model,
          content: [{ type: 'text' as const, text: 'respuesta OK' }],
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_creation_input_tokens: 200,
            cache_read_input_tokens: 800,
          },
          stop_reason: 'end_turn',
        };
      }),
    },
  };
  return { sdk, calls };
}

class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'APIError';
  }
}

// ----- Tests ----------------------------------------------------------------

describe('AnthropicClient', () => {
  let db: FakeDb;
  let prisma: PrismaClient;
  let secrets: ReturnType<typeof makeSecrets>;

  beforeEach(() => {
    db = { usages: [] };
    prisma = makePrisma(db);
    secrets = makeSecrets();
  });

  it('happy path: devuelve texto, usage, coste y logea a ai_usage_log', async () => {
    const { sdk, calls } = makeSdkOk();
    const client = new AnthropicClient({
      sdkFactory: () => sdk,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      secrets: secrets as any,
      db: prisma,
      backoffBaseMs: 1,
    });

    const res = await client.complete({
      feature: 'pain_points',
      systemBlocks: [
        { text: 'Eres un analista experto.', cache: true },
        { text: 'Contexto dinámico', cache: false },
      ],
      messages: [{ role: 'user', content: '¿Cuáles son los pain points?' }],
      userId: 'u_1',
      entityType: 'company',
      entityId: 'c_1',
    });

    expect(res.text).toBe('respuesta OK');
    expect(res.usage.inputTokens).toBe(1000);
    expect(res.usage.cacheReadInputTokens).toBe(800);
    expect(res.attempts).toBe(1);
    expect(res.costUsd).toBeGreaterThan(0);

    // ai_usage_log escrito con los campos correctos
    expect(db.usages).toHaveLength(1);
    const row = db.usages[0]!;
    expect(row.feature).toBe('pain_points');
    expect(row.inputTokens).toBe(1000);
    expect(row.outputTokens).toBe(500);
    expect(row.cacheCreationInputTokens).toBe(200);
    expect(row.cacheReadInputTokens).toBe(800);
    expect(row.userId).toBe('u_1');
    expect(row.entityType).toBe('company');

    // cache_control aplicado sólo al bloque marcado
    expect(calls).toHaveLength(1);
    const system = calls[0]!['system'] as Array<Record<string, unknown>>;
    expect(system).toHaveLength(2);
    expect(system[0]).toHaveProperty('cache_control', { type: 'ephemeral' });
    expect(system[1]).not.toHaveProperty('cache_control');
  });

  it('retry: 429 en el primer intento, éxito en el segundo', async () => {
    let attempts = 0;
    const sdk: AnthropicLike = {
      messages: {
        create: vi.fn(async (_params) => {
          attempts++;
          if (attempts === 1) throw new ApiError(429, 'rate limited');
          return {
            id: 'msg',
            model: 'claude-sonnet-4-6',
            content: [{ type: 'text' as const, text: 'ok' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          };
        }),
      },
    };
    const client = new AnthropicClient({
      sdkFactory: () => sdk,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      secrets: secrets as any,
      db: prisma,
      backoffBaseMs: 1,
    });

    const res = await client.complete({
      feature: 'content_idea',
      systemBlocks: [{ text: 's' }],
      messages: [{ role: 'user', content: 'q' }],
    });
    expect(res.attempts).toBe(2);
    expect(attempts).toBe(2);
  });

  it('error no-retryable (400): falla inmediatamente sin reintentar', async () => {
    let attempts = 0;
    const sdk: AnthropicLike = {
      messages: {
        create: vi.fn(async (_params) => {
          attempts++;
          throw new ApiError(400, 'bad request');
        }),
      },
    };
    const client = new AnthropicClient({
      sdkFactory: () => sdk,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      secrets: secrets as any,
      db: prisma,
      backoffBaseMs: 1,
    });

    await expect(
      client.complete({
        feature: 'content_idea',
        systemBlocks: [{ text: 's' }],
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toMatchObject({ code: 'AI_BAD_REQUEST', status: 400 });
    expect(attempts).toBe(1);
    expect(db.usages).toHaveLength(0); // no se logea consumo de un fallo
  });

  it('fallback: si el primary falla con 5xx tras 3 intentos, prueba el fallback tier', async () => {
    const modelsSeen: string[] = [];
    const sdk: AnthropicLike = {
      messages: {
        create: vi.fn(async (params: Record<string, unknown>) => {
          const model = params['model'] as string;
          modelsSeen.push(model);
          // sonnet (default) falla siempre; haiku (fallback) tiene éxito.
          if (model.startsWith('claude-sonnet')) throw new ApiError(503, 'overloaded');
          return {
            id: 'msg',
            model,
            content: [{ type: 'text' as const, text: 'fallback ok' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          };
        }),
      },
    };
    const client = new AnthropicClient({
      sdkFactory: () => sdk,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      secrets: secrets as any,
      db: prisma,
      backoffBaseMs: 1,
    });

    // pain_points tiene primary=default (sonnet) + fallback=fast (haiku)
    const res = await client.complete({
      feature: 'pain_points',
      systemBlocks: [{ text: 's' }],
      messages: [{ role: 'user', content: 'q' }],
    });

    expect(res.text).toBe('fallback ok');
    expect(res.modelUsed.startsWith('claude-haiku')).toBe(true);
    // 3 intentos en sonnet + 1 en haiku (haiku tuvo éxito al primero)
    expect(res.attempts).toBe(4);
    expect(modelsSeen.filter((m) => m.startsWith('claude-sonnet'))).toHaveLength(3);
    expect(modelsSeen.filter((m) => m.startsWith('claude-haiku'))).toHaveLength(1);
  });

  it('sin API key configurada → AI_NOT_CONFIGURED', async () => {
    const brokenSecrets = {
      get: vi.fn(async () => {
        throw new SecretNotConfiguredError('anthropic_primary');
      }),
      tryGet: vi.fn(async () => null),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
    };
    const client = new AnthropicClient({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      secrets: brokenSecrets as any,
      db: prisma,
      sdkFactory: () => ({ messages: { create: vi.fn() } }) as AnthropicLike,
    });

    await expect(
      client.complete({
        feature: 'other',
        systemBlocks: [{ text: 's' }],
        messages: [{ role: 'user', content: 'q' }],
      }),
    ).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  });

  it('tierOverride fuerza el modelo aunque la feature diga otro', async () => {
    const modelsSeen: string[] = [];
    const sdk: AnthropicLike = {
      messages: {
        create: vi.fn(async (params: Record<string, unknown>) => {
          modelsSeen.push(params['model'] as string);
          return {
            id: 'm',
            model: params['model'] as string,
            content: [{ type: 'text' as const, text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
          };
        }),
      },
    };
    const client = new AnthropicClient({
      sdkFactory: () => sdk,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      secrets: secrets as any,
      db: prisma,
      backoffBaseMs: 1,
    });
    // pain_points tiene primary=default, forzamos premium
    await client.complete({
      feature: 'pain_points',
      systemBlocks: [{ text: 's' }],
      messages: [{ role: 'user', content: 'q' }],
      tierOverride: 'premium',
    });
    expect(modelsSeen[0]!.startsWith('claude-opus')).toBe(true);
  });
});

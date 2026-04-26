import { describe, expect, it } from 'vitest';

import { estimateCostUsd, pricingForModel } from './pricing.js';

describe('pricingForModel', () => {
  it('matchea familia sonnet 4 por prefijo', () => {
    const p = pricingForModel('claude-sonnet-4-6');
    expect(p.input).toBe(3);
    expect(p.output).toBe(15);
  });

  it('matchea familia haiku 4', () => {
    const p = pricingForModel('claude-haiku-4-5-20251001');
    expect(p.input).toBe(1);
  });

  it('matchea familia opus 4', () => {
    const p = pricingForModel('claude-opus-4-7');
    expect(p.input).toBe(15);
    expect(p.output).toBe(75);
  });

  it('cae al fallback conservador para modelos desconocidos', () => {
    const p = pricingForModel('claude-unknown-model');
    expect(p.input).toBe(3); // igual que sonnet por defecto
  });
});

describe('estimateCostUsd', () => {
  it('sin cache: 1000 in + 500 out de sonnet = 0.003 + 0.0075 = 0.0105', () => {
    const cost = estimateCostUsd('claude-sonnet-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it('con cache read: cobra 10x menos en los tokens leídos', () => {
    const costNoCache = estimateCostUsd('claude-sonnet-4-6', {
      inputTokens: 10_000,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
    const costWithCache = estimateCostUsd('claude-sonnet-4-6', {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 10_000,
    });
    // sin cache: 10k * 3 / 1M = 0.03
    // con cache read: 10k * 0.3 / 1M = 0.003 (10x más barato)
    expect(costNoCache).toBeCloseTo(0.03, 6);
    expect(costWithCache).toBeCloseTo(0.003, 6);
    expect(costNoCache / costWithCache).toBeCloseTo(10, 2);
  });

  it('redondea a 6 decimales (alinea con Decimal(10,6) de Prisma)', () => {
    const cost = estimateCostUsd('claude-sonnet-4-6', {
      inputTokens: 1,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
    // 1 * 3 / 1e6 = 3e-6
    expect(cost).toBe(0.000003);
  });
});

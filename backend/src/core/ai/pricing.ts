// Precios estimados de Anthropic por 1M tokens (USD).
// Se usan para calcular `estimated_cost_usd` en `ai_usage_logs`. Si Anthropic
// actualiza precios, modificar este archivo — el resto del stack lo absorbe.
//
// Convención:
//   input           → tokens enviados al modelo (prompt + context)
//   output          → tokens generados
//   cache_write     → tokens que se escriben al cache (prompt caching; típicamente 1.25x input)
//   cache_read      → tokens leídos del cache (típicamente 0.1x input)
//
// Fuente: https://www.anthropic.com/pricing (último check: 2026-04-20)

export interface ModelPricing {
  /** USD por 1M tokens de input (sin cache). */
  input: number;
  /** USD por 1M tokens de output. */
  output: number;
  /** USD por 1M tokens al escribir al prompt cache. */
  cacheWrite: number;
  /** USD por 1M tokens al leer del prompt cache. */
  cacheRead: number;
}

/**
 * Tabla de precios por familia de modelo. La key es un "family tag" que
 * matcheamos haciendo `startsWith` contra el nombre del modelo (los model ids
 * evolucionan — `claude-sonnet-4-6`, `claude-sonnet-4-6-20260101` — y queremos
 * seguir cobrando bien sin tocar código).
 *
 * Orden: el primer match gana, así que poner los más específicos primero.
 */
const PRICING_TABLE: Array<[string, ModelPricing]> = [
  ['claude-opus-4', { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }],
  ['claude-sonnet-4', { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  ['claude-haiku-4', { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }],
  // Fallback histórico por si algún run usa un modelo viejo.
  ['claude-3-5-sonnet', { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
  ['claude-3-5-haiku', { input: 0.8, output: 4, cacheWrite: 1.0, cacheRead: 0.08 }],
];

/** Precio por defecto si el modelo no matchea — conservador (Sonnet). */
const DEFAULT_PRICING: ModelPricing = {
  input: 3,
  output: 15,
  cacheWrite: 3.75,
  cacheRead: 0.3,
};

export function pricingForModel(model: string): ModelPricing {
  for (const [prefix, pricing] of PRICING_TABLE) {
    if (model.startsWith(prefix)) return pricing;
  }
  return DEFAULT_PRICING;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

/**
 * Calcula el coste en USD con 6 decimales. Usamos número nativo porque los
 * órdenes de magnitud (0.0001–10 USD/request) no producen errores relevantes
 * de punto flotante para logging; el `Decimal(10,6)` de Prisma redondea al guardar.
 */
export function estimateCostUsd(model: string, counts: TokenCounts): number {
  const p = pricingForModel(model);
  const cost =
    (counts.inputTokens * p.input) / 1_000_000 +
    (counts.outputTokens * p.output) / 1_000_000 +
    (counts.cacheCreationInputTokens * p.cacheWrite) / 1_000_000 +
    (counts.cacheReadInputTokens * p.cacheRead) / 1_000_000;
  // 6 decimales para alinear con el Decimal(10,6) de la DB.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

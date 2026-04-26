// Map estático feature → tier de modelo + fallback + tokens por defecto.
//
// Los 3 tiers (default/fast/premium) se resuelven al nombre concreto del modelo
// vía env (`CLAUDE_MODEL_DEFAULT`/`CLAUDE_MODEL_FAST`/`CLAUDE_MODEL_PREMIUM`),
// de modo que al rotar a una versión nueva sólo tocamos `.env` — nunca código.

import type { AiFeature } from '@prisma/client';

import { env } from '../config/env.js';

export type ModelTier = 'fast' | 'default' | 'premium';

export interface FeatureConfig {
  primary: ModelTier;
  /** Tier alternativo si el primario falla/overload. Omitido ⇒ sin fallback. */
  fallback?: ModelTier;
  /** Tokens máximos a generar por llamada para esta feature. */
  maxTokens: number;
  /** Temperatura por defecto — overridable por caller. */
  temperature?: number;
}

export const FEATURE_MODEL_MAP: Record<AiFeature, FeatureConfig> = {
  // Extracción determinista (JSON con datos limpios de website) → Haiku basta.
  lead_enrichment_extract: {
    primary: 'fast',
    fallback: 'default',
    maxTokens: 4096,
    temperature: 0,
  },
  // Pain points requieren razonamiento; Sonnet con Haiku de fallback.
  pain_points: { primary: 'default', fallback: 'fast', maxTokens: 4096, temperature: 0.2 },
  service_fit: { primary: 'default', maxTokens: 2048, temperature: 0.3 },
  outbound_prep: { primary: 'default', maxTokens: 2048, temperature: 0.4 },
  content_idea: { primary: 'fast', maxTokens: 1024, temperature: 0.8 },
  content_draft: { primary: 'default', maxTokens: 4096, temperature: 0.7 },
  content_adapt: { primary: 'fast', maxTokens: 2048, temperature: 0.5 },
  other: { primary: 'default', maxTokens: 2048, temperature: 0.3 },
};

export function resolveModel(tier: ModelTier): string {
  switch (tier) {
    case 'fast':
      return env.CLAUDE_MODEL_FAST;
    case 'default':
      return env.CLAUDE_MODEL_DEFAULT;
    case 'premium':
      return env.CLAUDE_MODEL_PREMIUM;
  }
}

export function configForFeature(feature: AiFeature): FeatureConfig {
  return FEATURE_MODEL_MAP[feature];
}

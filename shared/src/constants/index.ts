// Constantes compartidas. No ubicar aquí valores sensibles ni env-dependientes.

export const APP_NAME = 'HeyDay CRM';
export const API_VERSION = 'v1';
export const DEFAULT_LOCALE = 'es-ES';
export const DEFAULT_TIMEZONE = 'Europe/Madrid';

// Paginación
export const PAGINATION = {
  defaultLimit: 20,
  maxLimit: 100,
} as const;

// Verticales ICP reales de HeyDay
export const ICP_VERTICALS = [
  'physiotherapy',
  'pilates',
  'yoga',
  'gym_fitness',
  'bakery',
  'cafe',
  'other',
] as const;
export type IcpVertical = (typeof ICP_VERTICALS)[number];

// Líneas de servicio reales de HeyDay
export const SERVICE_LINE_KEYS = ['automations', 'content', 'website_seo'] as const;
export type ServiceLineKey = (typeof SERVICE_LINE_KEYS)[number];

// Niveles de confianza para pain points
export const PAIN_POINT_CONFIDENCE = ['observed', 'inferred', 'speculative'] as const;
export type PainPointConfidence = (typeof PAIN_POINT_CONFIDENCE)[number];

// Canales de contenido
export const CONTENT_CHANNELS = ['instagram', 'linkedin', 'newsletter'] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];

// Pillars de contenido
export const CONTENT_PILLARS = [
  'education',
  'authority',
  'opinion',
  'case_study',
  'news_reactive',
] as const;
export type ContentPillar = (typeof CONTENT_PILLARS)[number];

// Estado de content items
export const CONTENT_ITEM_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'exported',
  'archived',
] as const;
export type ContentItemStatus = (typeof CONTENT_ITEM_STATUSES)[number];

// Roles de usuario
export const USER_ROLES = ['admin', 'operator', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// Stages por defecto del pipeline
export const DEFAULT_PIPELINE_STAGES = [
  { name: 'Nuevo', kind: 'open' as const, order_index: 0, color: '#9A9C92' },
  { name: 'Calificado', kind: 'open' as const, order_index: 1, color: '#7FB193' },
  { name: 'Contactado', kind: 'open' as const, order_index: 2, color: '#3A6B4A' },
  { name: 'Reunión', kind: 'open' as const, order_index: 3, color: '#D9B165' },
  { name: 'Propuesta', kind: 'open' as const, order_index: 4, color: '#B07A1F' },
  { name: 'Ganado', kind: 'won' as const, order_index: 5, color: '#3A6B4A' },
  { name: 'Perdido', kind: 'lost' as const, order_index: 6, color: '#B4442B' },
] as const;

// Códigos de error
export const ERROR_CODES = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  COMPANY_DOMAIN_CONFLICT: 'COMPANY_DOMAIN_CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTEGRATION_UNAVAILABLE: 'INTEGRATION_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

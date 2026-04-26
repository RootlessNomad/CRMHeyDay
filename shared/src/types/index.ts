// Tipos de dominio compartidos. Se irán añadiendo conforme se implementen módulos.

import type {
  ContentChannel,
  ContentItemStatus,
  ContentPillar,
  IcpVertical,
  PainPointConfidence,
  ServiceLineKey,
  UserRole,
} from '../constants/index.js';

/** Tipo base para respuestas de lista paginadas */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

/** Representación pública de un usuario (sin password_hash, sin refresh tokens) */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

/** Re-exports para comodidad del frontend */
export type {
  ContentChannel,
  ContentItemStatus,
  ContentPillar,
  IcpVertical,
  PainPointConfidence,
  ServiceLineKey,
  UserRole,
};

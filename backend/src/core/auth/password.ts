// Hash + verificación de contraseñas con bcrypt.
// Cost factor 12 según NFR — ~300ms en hardware típico.
// bcryptjs (JS puro) por portabilidad cross-platform/alpine sin compilación nativa.

import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;

/**
 * Minimo razonable por UX/seguridad. La política detallada (mezcla de caracteres, etc.)
 * se aplica en capa de validación de UI/API, no aquí.
 */
export const MIN_PASSWORD_LENGTH = 12;

export class WeakPasswordError extends Error {
  readonly code = 'AUTH_WEAK_PASSWORD';
  constructor(message = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`) {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError();
  }
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // Un hash mal formado no debe filtrarse al cliente — responde "credenciales inválidas"
    return false;
  }
}

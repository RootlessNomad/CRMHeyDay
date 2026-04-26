// Errores del dominio auth. Cada uno conoce su código estable (usado por el cliente)
// y un http status sugerido. La capa HTTP (IT-09) los mapea a respuestas uniformes.

import { ERROR_CODES, type ErrorCode } from '@heyday/shared';

export class AuthError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;

  constructor(code: ErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }

  static invalidCredentials(): AuthError {
    return new AuthError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Credenciales inválidas', 401);
  }

  static expired(): AuthError {
    return new AuthError(ERROR_CODES.AUTH_EXPIRED, 'La sesión ha expirado', 401);
  }

  static forbidden(message = 'Acceso denegado'): AuthError {
    return new AuthError(ERROR_CODES.FORBIDDEN, message, 403);
  }

  static internal(message = 'Error interno de autenticación'): AuthError {
    return new AuthError(ERROR_CODES.INTERNAL_ERROR, message, 500);
  }
}

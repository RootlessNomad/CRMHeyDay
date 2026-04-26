// Mapa de códigos de error del backend → copy en español para la UI.
// Fallback a un mensaje genérico si el código no está mapeado.

const MESSAGES: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: 'Email o contraseña incorrectos.',
  AUTH_EXPIRED: 'Tu sesión ha expirado. Vuelve a iniciar sesión.',
  AUTH_FORBIDDEN: 'No tienes permisos para esta acción.',
  RATE_LIMITED: 'Demasiados intentos. Espera un momento y prueba de nuevo.',
  VALIDATION_ERROR: 'Revisa los datos introducidos.',
  NOT_FOUND: 'No encontramos lo que buscabas.',
  INTERNAL_ERROR: 'Error del servidor. Inténtalo de nuevo en un momento.',
  UNKNOWN_ERROR: 'Ha ocurrido un error inesperado.',
};

const DEFAULT_MESSAGE = 'Ha ocurrido un error inesperado.';

export function copyForError(code: string, fallback?: string): string {
  return MESSAGES[code] ?? fallback ?? DEFAULT_MESSAGE;
}

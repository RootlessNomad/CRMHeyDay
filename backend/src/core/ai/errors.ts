// Errores del cliente Anthropic. Nunca exponen la API key ni payloads.

export type AnthropicErrorCode =
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_SERVER_ERROR'
  | 'AI_BAD_REQUEST'
  | 'AI_AUTH_FAILED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_UNKNOWN';

export class AnthropicError extends Error {
  readonly code: AnthropicErrorCode;
  readonly status: number | undefined;
  /** Cuántos intentos consumió antes de fallar (incluye primary + fallback). */
  readonly attempts: number;

  constructor(
    code: AnthropicErrorCode,
    message: string,
    opts: { status?: number; attempts?: number } = {},
  ) {
    super(message);
    this.name = 'AnthropicError';
    this.code = code;
    this.status = opts.status;
    this.attempts = opts.attempts ?? 1;
  }
}

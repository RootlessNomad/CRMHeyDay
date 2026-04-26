import { describe, expect, it } from 'vitest';

import { copyForError } from './error-messages';

describe('copyForError', () => {
  it('devuelve copy mapeada para código conocido', () => {
    expect(copyForError('AUTH_INVALID_CREDENTIALS')).toMatch(/incorrectos/i);
    expect(copyForError('RATE_LIMITED')).toMatch(/demasiados/i);
  });

  it('devuelve fallback para código desconocido', () => {
    expect(copyForError('UNMAPPED_CODE_XYZ', 'Custom fallback')).toBe('Custom fallback');
  });

  it('usa el mensaje genérico si no hay fallback', () => {
    expect(copyForError('UNMAPPED_CODE_XYZ')).toMatch(/inesperado/i);
  });
});

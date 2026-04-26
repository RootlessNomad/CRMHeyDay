import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { AuthError } from './errors.js';
import {
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './tokens.js';

describe('tokens', () => {
  it('access token: sign → verify round-trip con el mismo payload', () => {
    const token = signAccessToken({ sub: 'user_123', role: 'admin', sid: 'ses_abc' });
    const payload = verifyAccessToken(token);
    expect(payload).toMatchObject({
      sub: 'user_123',
      role: 'admin',
      sid: 'ses_abc',
      type: 'access',
    });
  });

  it('refresh token: sign → verify devuelve mismo sub/sid + jti + hash sha256', () => {
    const signed = signRefreshToken({ sub: 'user_123', sid: 'ses_abc' });
    expect(signed.token.split('.')).toHaveLength(3);
    expect(signed.hash).toHaveLength(64); // sha256 hex
    expect(signed.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(hashRefreshToken(signed.token)).toBe(signed.hash);

    const payload = verifyRefreshToken(signed.token);
    expect(payload.sub).toBe('user_123');
    expect(payload.sid).toBe('ses_abc');
    expect(payload.type).toBe('refresh');
    expect(payload.jti).toBe(signed.jti);
  });

  it('access token expirado lanza AuthError AUTH_EXPIRED', () => {
    const expired = jwt.sign(
      { sub: 'u', role: 'admin', sid: 's', type: 'access' },
      process.env['JWT_ACCESS_SECRET']!,
      { algorithm: 'HS256', expiresIn: -10 },
    );
    try {
      verifyAccessToken(expired);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe('AUTH_EXPIRED');
    }
  });

  it('access token con firma manipulada lanza AUTH_INVALID_CREDENTIALS', () => {
    const good = signAccessToken({ sub: 'u', role: 'admin', sid: 's' });
    const parts = good.split('.');
    const tampered = [parts[0], parts[1], 'X'.repeat(parts[2]!.length)].join('.');
    try {
      verifyAccessToken(tampered);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe('AUTH_INVALID_CREDENTIALS');
    }
  });

  it('un access token no pasa como refresh (type discriminator)', () => {
    const access = signAccessToken({ sub: 'u', role: 'admin', sid: 's' });
    expect(() => verifyRefreshToken(access)).toThrowError(AuthError);
  });

  it('un refresh token no pasa como access', () => {
    const refresh = signRefreshToken({ sub: 'u', sid: 's' });
    expect(() => verifyAccessToken(refresh.token)).toThrowError(AuthError);
  });
});

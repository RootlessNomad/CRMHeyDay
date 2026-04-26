// Tests del fetch wrapper con lógica de refresh. Mockamos `fetch` global.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../auth/store';
import { ApiError, AuthExpiredError, apiFetch } from './client';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('apiFetch', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inyecta Authorization Bearer si hay access token', async () => {
    useAuthStore.getState().setSession({
      user: {
        id: 'u1',
        email: 'a@b.c',
        name: 'A',
        role: 'admin',
        isActive: true,
        lastLoginAt: null,
      },
      accessToken: 'tok_123',
      accessExpiresAt: new Date().toISOString(),
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));

    await apiFetch('/foo');

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok_123');
    expect(init.credentials).toBe('include');
  });

  it('lanza ApiError con shape del backend cuando la respuesta no es ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'no existe' } }, { status: 404 }),
    );
    await expect(apiFetch('/foo')).rejects.toBeInstanceOf(ApiError);
  });

  it('en 401 intenta refresh una vez y reintenta la request original', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      // 1ª llamada → 401
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'AUTH_EXPIRED', message: 'x' } }, { status: 401 }),
      )
      // refresh → 200
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'tok_new', accessExpiresAt: new Date().toISOString() }),
      )
      // retry original → 200
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await apiFetch<{ ok: boolean }>('/foo');
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // la 2ª llamada es el refresh
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/auth/refresh');
    // el token nuevo quedó en el store
    expect(useAuthStore.getState().accessToken).toBe('tok_new');
  });

  it('si el refresh también falla, limpia el store y lanza AuthExpiredError', async () => {
    useAuthStore.getState().setSession({
      user: {
        id: 'u1',
        email: 'a@b.c',
        name: 'A',
        role: 'admin',
        isActive: true,
        lastLoginAt: null,
      },
      accessToken: 'tok_old',
      accessExpiresAt: new Date().toISOString(),
    });

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'AUTH_EXPIRED', message: 'x' } }, { status: 401 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 'AUTH_EXPIRED', message: 'x' } }, { status: 401 }),
      );

    const expiredListener = vi.fn();
    window.addEventListener('heyday:auth-expired', expiredListener);

    await expect(apiFetch('/foo')).rejects.toBeInstanceOf(AuthExpiredError);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    // El SessionWatcher se monta en (app)/layout y reacciona a este evento.
    expect(expiredListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('heyday:auth-expired', expiredListener);
  });

  it('no dispara refresh en /auth/login (skipAuth)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'x' } },
          { status: 401 },
        ),
      );
    await expect(
      apiFetch('/auth/login', { method: 'POST', json: {}, skipAuth: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

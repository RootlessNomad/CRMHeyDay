// Cliente HTTP del frontend.
//
// Responsabilidades:
// - Prefija la base URL (NEXT_PUBLIC_API_URL)
// - Inyecta `Authorization: Bearer` si hay access token en memoria
// - Envía la cookie de refresh (credentials: 'include')
// - Si el backend responde 401, intenta UNA rotación via /auth/refresh y reintenta
// - Si el refresh falla, limpia el store y lanza AuthExpiredError para que la UI redirija
// - Normaliza los errores del backend (shape `{error: {code, message, details?}}`) a ApiError

import { getAccessToken, useAuthStore } from '../auth/store';

// En producción se recomienda set NEXT_PUBLIC_API_URL=https://tudominio.com/api/v1
// Si no está definida, se usa '/api/v1' (relativa al origen) — funciona cuando
// frontend y backend comparten dominio (ej. crm.estudioheyday.com).
// En desarrollo, .env.local sobreescribe con http://localhost:3001.
const RAW_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '/api/v1';
// Sin barra final para concatenar paths sin ambigüedad.
const API_BASE = RAW_BASE.replace(/\/$/, '');

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

export class AuthExpiredError extends ApiError {
  constructor() {
    super(401, { code: 'AUTH_EXPIRED', message: 'Sesión caducada' });
    this.name = 'AuthExpiredError';
  }
}

export interface ApiRequestInit extends Omit<RequestInit, 'body' | 'headers'> {
  /** Payload JSON — se serializa y fija Content-Type automáticamente. */
  json?: unknown;
  /** Headers extra (se mergean). */
  headers?: Record<string, string>;
  /** Si true, no inyecta Authorization aunque haya token (login, refresh). */
  skipAuth?: boolean;
}

async function rawFetch(path: string, init: ApiRequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (!init.skipAuth) {
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const { json, skipAuth, ...rest } = init;
  void skipAuth;
  const fetchInit: RequestInit = {
    ...(rest as RequestInit),
    headers,
    // `include` → el navegador envía la cookie `hd_refresh` en cross-origin
    // (APP_URL del CORS del backend autoriza credentials).
    credentials: 'include',
  };
  if (json !== undefined) fetchInit.body = JSON.stringify(json);
  return fetch(`${API_BASE}${path}`, fetchInit);
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshOnce(): Promise<boolean> {
  // Coalesce: si varias requests 401 simultáneas, todas esperan al mismo refresh.
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await rawFetch('/auth/refresh', { method: 'POST', skipAuth: true });
      if (!res.ok) return false;
      const body = (await res.json()) as {
        accessToken: string;
        accessExpiresAt: string;
      };
      useAuthStore
        .getState()
        .updateAccess({ accessToken: body.accessToken, accessExpiresAt: body.accessExpiresAt });
      return true;
    } catch {
      return false;
    } finally {
      // Limpiar sincrónicamente: los callers ya tienen referencia a la Promise;
      // el dogpiling durante el mismo tick ya se coalesce porque todos leen la
      // misma variable antes de que resuelva.
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Parsea un error del backend (puede ser JSON `{error: {...}}` o texto plano).
 */
async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: ApiErrorPayload };
    if (body.error?.code) return new ApiError(res.status, body.error);
  } catch {
    // respuesta no-JSON; caemos al genérico
  }
  return new ApiError(res.status, {
    code: 'UNKNOWN_ERROR',
    message: `Error ${res.status}`,
  });
}

export async function apiFetch<T = unknown>(path: string, init: ApiRequestInit = {}): Promise<T> {
  let res = await rawFetch(path, init);

  // 401 + no estamos en endpoints de auth → intenta refresh una vez.
  if (
    res.status === 401 &&
    !init.skipAuth &&
    !path.startsWith('/auth/refresh') &&
    !path.startsWith('/auth/login')
  ) {
    const refreshed = await tryRefreshOnce();
    if (refreshed) {
      res = await rawFetch(path, init);
    } else {
      useAuthStore.getState().clear();
      // Notifica al SessionWatcher (montado en (app)/layout) para que muestre
      // toast + redirija. Si no hay listener (ej. tests Node), el evento se
      // pierde silenciosamente — no hace daño.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('heyday:auth-expired'));
      }
      throw new AuthExpiredError();
    }
  }

  if (!res.ok) {
    throw await toApiError(res);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

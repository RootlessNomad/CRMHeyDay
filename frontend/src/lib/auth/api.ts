// Wrappers tipados para los endpoints /auth/* del backend.

import { apiFetch } from '../api/client';
import type { PublicUser } from './store';

export interface LoginResponse {
  user: PublicUser;
  accessToken: string;
  accessExpiresAt: string;
}

export interface RefreshResponse {
  accessToken: string;
  accessExpiresAt: string;
}

export function loginRequest(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    json: { email, password },
    skipAuth: true,
  });
}

export function logoutRequest(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}

export function meRequest(): Promise<{ user: PublicUser }> {
  return apiFetch<{ user: PublicUser }>('/auth/me');
}

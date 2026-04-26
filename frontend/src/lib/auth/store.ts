// Store de auth en memoria (no localStorage — evita XSS exfiltration del access token).
// El refresh token vive SÓLO en la cookie httpOnly que el backend setea en /auth/login
// y /auth/refresh; esta capa nunca lo ve.

import { create } from 'zustand';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
  isActive: boolean;
  lastLoginAt: string | null;
}

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  accessExpiresAt: string | null;
  setSession: (s: { user: PublicUser; accessToken: string; accessExpiresAt: string }) => void;
  updateAccess: (s: { accessToken: string; accessExpiresAt: string }) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  accessExpiresAt: null,
  setSession: (s) =>
    set({
      user: s.user,
      accessToken: s.accessToken,
      accessExpiresAt: s.accessExpiresAt,
    }),
  updateAccess: (s) => set({ accessToken: s.accessToken, accessExpiresAt: s.accessExpiresAt }),
  clear: () => set({ user: null, accessToken: null, accessExpiresAt: null }),
}));

/**
 * Helper sincrónico para consumo desde el fetch wrapper (fuera de React).
 * `useAuthStore.getState()` funciona en cualquier contexto.
 */
export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

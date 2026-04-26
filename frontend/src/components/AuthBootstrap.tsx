'use client';

// Boot de sesión en cliente: al montar el layout autenticado, hay dos casos:
//   (1) El usuario acaba de hacer login → el store ya tiene user + access token.
//   (2) El usuario llegó con la cookie refresh pero sin access en memoria
//       (ej: refresh de página F5). En ese caso pedimos un nuevo access con
//       POST /auth/refresh, y leemos al usuario con /auth/me.
//
// Si ambos fallan, la cookie está caducada/revocada → se limpia y se redirige.

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api/client';
import { meRequest } from '@/lib/auth/api';
import { useAuthStore } from '@/lib/auth/store';

interface RefreshResponse {
  accessToken: string;
  accessExpiresAt: string;
}

export function AuthBootstrap({ children }: { children: React.ReactNode }): JSX.Element | null {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const updateAccess = useAuthStore((s) => s.updateAccess);
  const clear = useAuthStore((s) => s.clear);

  const [ready, setReady] = useState<boolean>(Boolean(user && accessToken));

  useEffect(() => {
    if (user && accessToken) {
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const refreshed = await apiFetch<RefreshResponse>('/auth/refresh', {
          method: 'POST',
          skipAuth: true,
        });
        if (cancelled) return;
        updateAccess(refreshed);
        const { user: u } = await meRequest();
        if (cancelled) return;
        setSession({ user: u, ...refreshed });
        setReady(true);
      } catch {
        if (cancelled) return;
        clear();
        router.replace('/login');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, accessToken, setSession, updateAccess, clear, router]);

  if (!ready) {
    // Placeholder minimal mientras resolvemos la sesión (evita flash de contenido protegido).
    return (
      <div className="text-text-muted flex min-h-screen items-center justify-center text-sm">
        Cargando…
      </div>
    );
  }

  return <>{children}</>;
}

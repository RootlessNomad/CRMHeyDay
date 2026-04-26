'use client';

// Componente invisible que escucha pérdidas de sesión globales y reacciona.
//
// Dos disparadores:
//   1. `heyday:auth-expired` (Window Event) — emitido por `apiFetch` cuando un
//      refresh falla tras un 401. La sesión ya está limpia en el store.
//   2. BroadcastChannel `heyday-auth` con `{type:'logout'}` — emitido por otra
//      pestaña que hizo logout. Replicamos la limpieza local + redirigimos.
//
// Acción común: toast informativo + `router.replace('/login')` (sustituye la
// entrada actual del history para que el botón "atrás" no vuelva a la página
// privada).

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { onAuthBroadcast } from '@/lib/auth/broadcast';
import { useAuthStore } from '@/lib/auth/store';

export function SessionWatcher(): null {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    const handleExpired = (): void => {
      toast.error('Tu sesión ha expirado. Vuelve a iniciar sesión.');
      router.replace('/login');
    };

    window.addEventListener('heyday:auth-expired', handleExpired);

    const unsubscribe = onAuthBroadcast((msg) => {
      if (msg.type === 'logout' || msg.type === 'session-expired') {
        clear();
        toast.message('Sesión cerrada en otra pestaña');
        router.replace('/login');
      }
    });

    return () => {
      window.removeEventListener('heyday:auth-expired', handleExpired);
      unsubscribe();
    };
  }, [router, clear]);

  return null;
}

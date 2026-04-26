'use client';

// Topbar — buscador placeholder (cmd-K en UJ-06), avatar con menú, theme toggle.
// Glassmorphism sutil al hacer scroll (el style_guide permite glass en topbar).

import { LogOut, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { logoutRequest } from '@/lib/auth/api';
import { useAuthStore } from '@/lib/auth/store';

import { ThemeToggle } from './ThemeToggle';

export function Topbar(): JSX.Element {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout(): Promise<void> {
    try {
      await logoutRequest();
    } catch {
      // ignoramos errores: limpiamos igual en cliente para evitar estado colgado
    }
    clear();
    toast.success('Sesión cerrada');
    router.replace('/login');
  }

  // Iniciales para avatar cuando no hay foto. Si no hay user (pre-hydration),
  // placeholder neutro.
  const initials = user?.name
    ? user.name
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s.charAt(0).toUpperCase())
        .join('')
    : '··';

  return (
    <header className="glass border-border sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 lg:px-6">
      <div className="relative max-w-xl flex-1">
        <Search className="text-text-muted pointer-events-none absolute left-3 top-2.5 h-4 w-4" />
        <input
          type="search"
          placeholder="Buscar empresas, contactos, leads…  (⌘K)"
          disabled
          className="border-border bg-surface-muted placeholder:text-text-muted h-9 w-full rounded-md border pl-9 pr-3 text-sm disabled:cursor-not-allowed"
          aria-label="Búsqueda global (disponible próximamente)"
        />
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="hover:bg-surface-muted flex h-9 items-center gap-2 rounded-md px-2 transition"
          >
            <span className="bg-accent-soft text-accent flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium">
              {initials}
            </span>
            <span className="hidden text-sm font-medium md:inline">{user?.name ?? '···'}</span>
          </button>

          {menuOpen ? (
            <>
              <div
                role="presentation"
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div
                role="menu"
                className="border-border bg-surface absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-md border shadow-md"
              >
                <div className="border-border border-b px-4 py-3">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-text-muted truncate text-xs">{user?.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-danger hover:bg-surface-muted flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition"
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

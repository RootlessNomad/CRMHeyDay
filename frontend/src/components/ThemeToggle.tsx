'use client';

// Toggle de theme light/dark. Usa next-themes; muestra el icono del estado
// opuesto (lo que obtendrás al pulsar).
// SSR-safe: mientras `mounted` es false, renderiza un placeholder con mismas
// dimensiones para evitar layout shift.
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle(): JSX.Element {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="text-text-muted hover:bg-surface-muted hover:text-text inline-flex h-9 w-9 items-center justify-center rounded-md transition"
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )
      ) : (
        <span className="h-4 w-4" />
      )}
    </button>
  );
}

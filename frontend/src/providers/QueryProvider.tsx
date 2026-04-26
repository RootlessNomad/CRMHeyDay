'use client';

// TanStack Query configurada con defaults conservadores:
// - staleTime 30s (evita refetch en navegación reciente)
// - refetchOnWindowFocus false (UX sin saltos cuando vuelves a la pestaña)
// - retry 1 (una reintento transitorio; nada de spamming)
// - El QueryClient se crea en estado para que no se comparta entre renders de SSR.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }): JSX.Element {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

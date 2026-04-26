'use client';

// Boundary global de errores de render. Next la monta automáticamente.
// No exponemos el mensaje del error al usuario (puede filtrar detalles internos);
// mostramos copy genérica y ofrecemos reintento.

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-danger font-mono text-6xl font-semibold">500</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Algo ha fallado</h1>
        <p className="text-text-muted mt-2 text-sm">
          Hemos registrado el problema. Puedes intentarlo de nuevo.
        </p>
        <button
          type="button"
          onClick={reset}
          className="bg-accent mt-6 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}

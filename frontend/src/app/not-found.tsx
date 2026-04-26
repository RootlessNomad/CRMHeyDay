import Link from 'next/link';

export default function NotFound(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-accent font-mono text-6xl font-semibold">404</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Página no encontrada</h1>
        <p className="text-text-muted mt-2 text-sm">
          La ruta que buscas no existe o ha sido movida.
        </p>
        <Link
          href="/"
          className="bg-accent mt-6 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}

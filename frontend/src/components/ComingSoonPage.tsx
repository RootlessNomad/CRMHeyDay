'use client';

import Link from 'next/link';

interface ComingSoonPageProps {
  title: string;
  description: string;
  milestone: string;
}

export function ComingSoonPage({
  title,
  description,
  milestone,
}: ComingSoonPageProps): JSX.Element {
  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <div className="border-border bg-surface rounded-xl border p-10 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-text-muted mt-3 text-sm leading-6">{description}</p>
        <p className="text-text-muted mt-4 text-xs">
          Disponible en <span className="font-medium">{milestone}</span>
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="border-border bg-surface-muted hover:bg-bg inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium transition"
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

'use client';

// Dashboard placeholder. La versión real (UJ-08) traerá KPIs y próximas acciones.
// De momento: cards vacías con estado claro para verificar el shell.

import { useAuthStore } from '@/lib/auth/store';

export default function DashboardPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {user?.name?.split(' ')[0] ?? 'equipo'}
        </h1>
        <p className="text-text-muted mt-1 text-sm">
          Tu panel con métricas y próximas acciones aparecerá aquí.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Leads abiertos', value: '—' },
          { label: 'Sin acción >7d', value: '—' },
          { label: 'Aprobaciones pendientes', value: '—' },
          { label: 'Jobs activos', value: '—' },
        ].map((card) => (
          <div
            key={card.label}
            className="border-border bg-surface rounded-lg border p-5 shadow-sm"
          >
            <p className="text-text-muted text-xs uppercase tracking-wide">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="border-border bg-surface rounded-lg border p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Empieza por aquí</h2>
        <p className="text-text-muted mt-1 text-sm">
          Añade tu primera empresa o pega una URL en <span className="font-medium">Investigar</span>
          &nbsp;para que Claude extraiga datos y pain points.
        </p>
      </div>
    </div>
  );
}

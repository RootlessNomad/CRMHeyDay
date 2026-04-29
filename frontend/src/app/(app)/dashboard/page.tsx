'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { getDashboardMetrics, getTopPriorityLeads, getUpcomingActions } from '@/lib/api/dashboard';
import { useAuthStore } from '@/lib/auth/store';

function formatDay(input: string): string {
  return new Date(input).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  });
}

function getEntityHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case 'company':
      return `/companies/${entityId}`;
    case 'contact':
      return `/contacts/${entityId}`;
    case 'lead':
      return `/leads/${entityId}`;
    default:
      return null;
  }
}

function MetricCard({
  href,
  label,
  value,
}: {
  href?: string;
  label: string;
  value: number | string;
}): JSX.Element {
  const className =
    'border-border bg-surface rounded-lg border p-5 shadow-sm transition hover:border-accent/40 hover:shadow-md';
  const content = (
    <>
      <p className="text-text-muted text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </>
  );

  if (!href) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link href={href} className={`block ${className}`}>
      {content}
    </Link>
  );
}

function ListSkeleton(): JSX.Element {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="border-border bg-surface rounded-lg border p-4 shadow-sm">
          <div className="bg-surface-muted h-4 w-20 animate-pulse rounded" />
          <div className="bg-surface-muted mt-3 h-4 w-3/4 animate-pulse rounded" />
          <div className="bg-surface-muted mt-3 h-4 w-24 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const metricsQuery = useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: getDashboardMetrics,
  });
  const upcomingActionsQuery = useQuery({
    queryKey: ['dashboard', 'upcoming-actions'],
    queryFn: getUpcomingActions,
  });
  const topLeadsQuery = useQuery({
    queryKey: ['dashboard', 'top-priority-leads'],
    queryFn: getTopPriorityLeads,
  });

  const metrics = metricsQuery.data;
  const upcomingActions = upcomingActionsQuery.data ?? [];
  const topLeads = topLeadsQuery.data ?? [];
  const isGloballyEmpty =
    metricsQuery.isFetched &&
    upcomingActionsQuery.isFetched &&
    topLeadsQuery.isFetched &&
    metrics?.leads_open === 0 &&
    upcomingActions.length === 0 &&
    topLeads.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {user?.name?.split(' ')[0] ?? 'equipo'}
        </h1>
        <p className="text-text-muted mt-1 text-sm">
          {new Date().toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          href="/leads"
          label="Leads abiertos"
          value={metricsQuery.isLoading ? '—' : (metrics?.leads_open ?? '—')}
        />
        <MetricCard
          href="/leads"
          label="Sin acción >7d"
          value={metricsQuery.isLoading ? '—' : (metrics?.leads_stale ?? '—')}
        />
        <MetricCard
          href="/content/reviews"
          label="Aprobaciones pendientes"
          value={metricsQuery.isLoading ? '—' : (metrics?.approvals_pending ?? '—')}
        />
        <MetricCard
          label="Jobs activos"
          value={metricsQuery.isLoading ? '—' : (metrics?.jobs_running ?? '—')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Próximas acciones</h2>
          {upcomingActionsQuery.isLoading ? (
            <ListSkeleton />
          ) : upcomingActions.length === 0 ? (
            <p className="text-text-muted text-sm">Sin acciones próximas.</p>
          ) : (
            <div className="space-y-3">
              {upcomingActions.map((action) => {
                const entityHref = getEntityHref(action.entity_type, action.entity_id);

                return (
                  <div
                    key={action.id}
                    className="border-border bg-surface rounded-lg border p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="bg-surface-muted inline-flex rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wide">
                          {action.kind}
                        </span>
                        <p className="mt-2 truncate text-sm font-medium">
                          {action.title ?? '(sin título)'}
                        </p>
                      </div>
                      <p className="text-text-muted shrink-0 text-sm">{formatDay(action.due_at)}</p>
                    </div>
                    <div className="mt-3">
                      {entityHref ? (
                        <Link href={entityHref} className="text-sm font-medium hover:underline">
                          Abrir {action.entity_type}
                        </Link>
                      ) : (
                        <span className="text-text-muted text-sm">{action.entity_type}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Leads de máxima prioridad</h2>
          {topLeadsQuery.isLoading ? (
            <ListSkeleton />
          ) : topLeads.length === 0 ? (
            <p className="text-text-muted text-sm">Sin leads abiertos.</p>
          ) : (
            <div className="space-y-3">
              {topLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="border-border bg-surface hover:border-accent/40 block rounded-lg border p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium">{lead.title}</p>
                    <p className="shrink-0 text-sm font-semibold">{lead.priority_score}</p>
                  </div>
                  <div className="mt-3">
                    <span className="bg-surface-muted inline-flex rounded-full px-2 py-1 text-[11px] font-medium">
                      {lead.stage_name ?? 'sin stage'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="border-border bg-surface rounded-lg border p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Coste IA este mes</h2>
        <p className="text-text-muted mt-2 text-sm">
          {metricsQuery.isLoading
            ? '—'
            : metrics && metrics.ai_cost_month_usd > 0
              ? `${metrics.ai_cost_month_usd.toFixed(2)} USD`
              : 'Sin uso este mes.'}
        </p>
      </div>

      {isGloballyEmpty ? (
        <div className="border-border bg-surface rounded-lg border p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Empieza por aquí</h2>
          <p className="text-text-muted mt-1 text-sm">
            Añade tu primera empresa o pega una URL en{' '}
            <span className="font-medium">Investigar</span> para que Claude extraiga datos y pain
            points.
          </p>
        </div>
      ) : null}
    </div>
  );
}

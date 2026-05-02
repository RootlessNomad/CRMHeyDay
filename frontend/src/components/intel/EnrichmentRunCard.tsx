'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { getEnrichmentRun, isInFlight } from '@/lib/api/intel';

interface EnrichmentRunCardProps {
  runId: string;
}

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-surface-muted text-text-muted border-border',
  running: 'border-yellow-300 bg-yellow-50 text-yellow-800 animate-pulse',
  succeeded: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  partial: 'border-orange-300 bg-orange-50 text-orange-700',
  failed: 'border-red-300 bg-red-50 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'Pendiente',
  running: 'En curso',
  succeeded: 'Completado',
  partial: 'Parcial',
  failed: 'Fallido',
};

function formatDurationSeconds(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return '—';

  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();

  if (Number.isNaN(started) || Number.isNaN(finished) || finished < started) return '—';

  return `${Math.round((finished - started) / 1000)} s`;
}

function getSourceCount(summary: Record<string, unknown>, fallbackCount: number): number {
  const value = summary['source_hits_count'];
  return typeof value === 'number' ? value : fallbackCount;
}

export function EnrichmentRunCard({ runId }: EnrichmentRunCardProps): JSX.Element {
  const runQuery = useQuery({
    queryKey: ['intel', 'enrichment-run', runId],
    queryFn: () => getEnrichmentRun(runId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && isInFlight(data) ? 4000 : false;
    },
  });

  if (runQuery.isLoading) {
    return (
      <div className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
        <p className="text-text-muted text-sm">Cargando investigación...</p>
      </div>
    );
  }

  if (runQuery.isError) {
    return (
      <div className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
        <p className="text-sm text-red-600">
          {runQuery.error instanceof Error
            ? runQuery.error.message
            : 'No se pudo cargar la investigación.'}
        </p>
      </div>
    );
  }

  const run = runQuery.data;
  if (!run) {
    return (
      <div className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
        <p className="text-text-muted text-sm">No hay datos de esta investigación.</p>
      </div>
    );
  }

  const showCompanyLink = run.status === 'succeeded' || run.status === 'partial';
  const sourceCount = getSourceCount(run.summary, run.source_hits.length);

  return (
    <article className="border-border bg-surface space-y-4 rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[run.status] ?? STATUS_STYLES['queued']}`}
          >
            {STATUS_LABELS[run.status] ?? run.status}
          </span>
          <div>
            <p className="text-text-muted text-xs uppercase tracking-[0.16em]">URL investigada</p>
            <p className="mt-1 break-all text-sm font-medium">{run.input_url ?? '—'}</p>
          </div>
        </div>

        {showCompanyLink ? (
          <Link
            href={`/companies/${run.company_id}`}
            className="border-border bg-surface-muted hover:bg-bg inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium transition"
          >
            Ver empresa →
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border-border bg-surface-muted rounded-xl border px-4 py-3">
          <p className="text-text-muted text-xs uppercase tracking-[0.16em]">Duración</p>
          <p className="mt-1 text-sm font-medium">
            {formatDurationSeconds(run.started_at, run.finished_at)}
          </p>
        </div>
        <div className="border-border bg-surface-muted rounded-xl border px-4 py-3">
          <p className="text-text-muted text-xs uppercase tracking-[0.16em]">Pain points</p>
          <p className="mt-1 text-sm font-medium">{run.pain_points_created_count}</p>
        </div>
        <div className="border-border bg-surface-muted rounded-xl border px-4 py-3">
          <p className="text-text-muted text-xs uppercase tracking-[0.16em]">Service fits</p>
          <p className="mt-1 text-sm font-medium">{run.service_fits_created_count}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="border-border bg-surface-muted rounded-full border px-3 py-1">
          Fuentes procesadas: {sourceCount}
        </span>
        {run.error_message ? (
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">
            {run.error_message}
          </span>
        ) : null}
      </div>
    </article>
  );
}

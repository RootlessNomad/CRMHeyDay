'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { BulkDiscoverySummary } from '@/lib/api/discovery';
import { getJob, isJobInFlight } from '@/lib/api/jobs';

interface BulkDiscoveryStatusProps {
  jobId: string;
  onDismiss: () => void;
}

function asSummary(result: unknown): BulkDiscoverySummary | null {
  if (!result || typeof result !== 'object') return null;
  const candidate = result as Record<string, unknown>;
  if (typeof candidate['found'] !== 'number') return null;
  return candidate as unknown as BulkDiscoverySummary;
}

export function BulkDiscoveryStatus({ jobId, onDismiss }: BulkDiscoveryStatusProps): JSX.Element {
  const queryClient = useQueryClient();
  const invalidatedRef = useRef(false);

  const jobQuery = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => getJob(jobId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && isJobInFlight(data) ? 4000 : false;
    },
  });

  const job = jobQuery.data;
  const inFlight = job ? isJobInFlight(job) : true;

  // Cuando el job termina, refrescamos la lista de empresas una sola vez.
  useEffect(() => {
    if (!job || inFlight || invalidatedRef.current) return;
    invalidatedRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ['companies'] });
  }, [inFlight, job, queryClient]);

  const summary = job ? asSummary(job.result) : null;
  const failed = job?.status === 'failed';

  return (
    <div className="border-border bg-surface flex items-start justify-between gap-4 rounded-lg border p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {inFlight
            ? 'Descubriendo negocios…'
            : failed
              ? 'El descubrimiento falló.'
              : 'Descubrimiento completado'}
        </p>
        {inFlight ? (
          <p className="text-text-muted text-sm">
            Buscando en Google Places y creando empresas. Puedes seguir trabajando.
          </p>
        ) : summary ? (
          <p className="text-text-muted text-sm">
            {summary.created} creadas · {summary.duplicated} duplicadas · {summary.enriched}{' '}
            enriquecidas
            {summary.errors > 0 ? ` · ${summary.errors} errores` : ''} (de {summary.found}{' '}
            encontradas).
          </p>
        ) : failed ? (
          <p className="text-text-muted text-sm">{job?.error ?? 'Error desconocido.'}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-text-muted hover:text-text text-sm font-medium"
      >
        {inFlight ? 'Ocultar' : 'Cerrar'}
      </button>
    </div>
  );
}

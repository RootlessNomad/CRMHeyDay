'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { LeadDiscoverySummary } from '@/lib/api/lead-discovery';
import { getJob, isJobInFlight } from '@/lib/api/jobs';

interface LeadDiscoveryStatusProps {
  jobId: string;
  onDismiss: () => void;
}

function asLeadSummary(result: unknown): LeadDiscoverySummary | null {
  if (!result || typeof result !== 'object') return null;
  const c = result as Record<string, unknown>;
  if (typeof c['qualified'] !== 'number') return null;
  return c as unknown as LeadDiscoverySummary;
}

export function LeadDiscoveryStatus({ jobId, onDismiss }: LeadDiscoveryStatusProps): JSX.Element {
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

  useEffect(() => {
    if (!job || inFlight || invalidatedRef.current) return;
    invalidatedRef.current = true;
    void queryClient.invalidateQueries({ queryKey: ['leads'] });
    void queryClient.invalidateQueries({ queryKey: ['companies'] });
  }, [inFlight, job, queryClient]);

  const summary = job ? asLeadSummary(job.result) : null;
  const failed = job?.status === 'failed';

  return (
    <div className="border-border bg-surface flex items-start justify-between gap-4 rounded-lg border p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {inFlight ? 'Buscando leads…' : failed ? 'La búsqueda falló.' : 'Búsqueda completada'}
        </p>
        {inFlight ? (
          <p className="text-text-muted text-sm">
            Encontrando negocios y creando leads cualificados. Puedes seguir trabajando.
          </p>
        ) : summary ? (
          <p className="text-text-muted text-sm">
            {summary.qualified} leads cualificados · {summary.leads_created} creados (de{' '}
            {summary.found} encontrados)
            {summary.errors > 0 ? ` · ${summary.errors} errores` : ''}.
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

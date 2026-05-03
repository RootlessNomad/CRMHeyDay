'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getJob, isJobInFlight } from '@/lib/api/jobs';

interface IdeaJobTrackerProps {
  jobId: string;
  onComplete: () => void;
}

export function IdeaJobTracker({ jobId, onComplete }: IdeaJobTrackerProps): JSX.Element {
  const completedRef = useRef(false);
  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId),
    refetchInterval: (query) => {
      const job = query.state.data;
      return job && isJobInFlight(job) ? 4000 : false;
    },
  });

  useEffect(() => {
    if (jobQuery.data?.status !== 'succeeded' || completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [jobQuery.data?.status, onComplete]);

  if (jobQuery.isLoading) {
    return (
      <div className="border-border bg-surface rounded-2xl border p-4 shadow-sm">
        <p className="text-text-muted text-sm">Preparando generación de ideas...</p>
      </div>
    );
  }

  if (jobQuery.isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
        <p className="text-sm text-red-700">
          {jobQuery.error instanceof Error
            ? jobQuery.error.message
            : 'No se pudo consultar el job.'}
        </p>
      </div>
    );
  }

  const job = jobQuery.data;
  if (!job) {
    return (
      <div className="border-border bg-surface rounded-2xl border p-4 shadow-sm">
        <p className="text-text-muted text-sm">No hay información del job.</p>
      </div>
    );
  }

  if (job.status === 'queued' || job.status === 'running') {
    return (
      <div className="border-border bg-surface rounded-2xl border p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex animate-pulse rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-800">
            Generando ideas...
          </span>
          <p className="text-text-muted text-sm">Claude está pensando en ideas nuevas</p>
        </div>
      </div>
    );
  }

  if (job.status === 'failed') {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
        <p className="text-sm font-medium text-red-700">La generación ha fallado.</p>
        {job.error ? <p className="mt-1 text-sm text-red-700">{job.error}</p> : null}
      </div>
    );
  }

  const result = job.result as { count?: unknown } | null;
  const count = typeof result?.count === 'number' ? result.count : 0;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
      <p className="text-sm font-medium text-emerald-700">{count} ideas creadas</p>
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { useQueries } from '@tanstack/react-query';

import { CHANNEL_LABELS } from '@/lib/api/content';
import { getJob, isJobInFlight } from '@/lib/api/jobs';

interface DraftJobsTrackerProps {
  jobIds: string[];
  itemIds: string[];
  onAllComplete: (firstItemId: string) => void;
}

const CHANNEL_ORDER = ['instagram', 'linkedin', 'newsletter'] as const;

const STATUS_LABELS: Record<string, string> = {
  queued: 'Pendiente',
  running: 'En curso',
  succeeded: 'Completado',
  failed: 'Fallido',
};

const STATUS_STYLES: Record<string, string> = {
  queued: 'border-border bg-surface-muted text-text-muted',
  running: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  succeeded: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
};

export function DraftJobsTracker({
  jobIds,
  itemIds,
  onAllComplete,
}: DraftJobsTrackerProps): JSX.Element {
  const completedRef = useRef(false);
  const jobQueries = useQueries({
    queries: jobIds.map((jobId) => ({
      queryKey: ['job', jobId],
      queryFn: () => getJob(jobId),
      refetchInterval: (query: { state: { data?: { status: string } } }) => {
        const job = query.state.data;
        return job && isJobInFlight(job) ? 4000 : false;
      },
    })),
  });

  const allSucceeded =
    jobQueries.length > 0 && jobQueries.every((jobQuery) => jobQuery.data?.status === 'succeeded');

  useEffect(() => {
    if (!allSucceeded || completedRef.current || !itemIds[0]) return;
    completedRef.current = true;
    onAllComplete(itemIds[0]);
  }, [allSucceeded, itemIds, onAllComplete]);

  return (
    <section className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Generación de borradores</h2>
        <p className="text-text-muted mt-1 text-sm">
          Seguimiento de los borradores en curso por canal.
        </p>
      </div>

      <div className="space-y-3">
        {jobQueries.map((jobQuery, index) => {
          const job = jobQuery.data;
          const status = job?.status ?? 'queued';
          const channel = CHANNEL_ORDER[index] ?? 'instagram';
          const label = CHANNEL_LABELS[channel] ?? `Canal ${index + 1}`;

          return (
            <div
              key={jobIds[index]}
              className="border-border bg-bg flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium">{label}</p>
                {status === 'failed' && job?.error ? (
                  <p className="mt-1 text-sm text-red-700">{job.error}</p>
                ) : null}
              </div>

              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES['queued']}`}
              >
                {STATUS_LABELS[status] ?? status}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

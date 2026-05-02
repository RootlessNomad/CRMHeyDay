'use client';

import { EnrichmentRunCard } from './EnrichmentRunCard';

interface RecentRunsListProps {
  runIds: string[];
}

export function RecentRunsList({ runIds }: RecentRunsListProps): JSX.Element {
  if (runIds.length === 0) {
    return (
      <div className="border-border bg-surface rounded-2xl border p-8 text-center shadow-sm">
        <p className="text-text-muted text-sm">
          Aún no hay investigaciones. Pega una URL arriba para empezar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {runIds.map((runId) => (
        <EnrichmentRunCard key={runId} runId={runId} />
      ))}
    </div>
  );
}

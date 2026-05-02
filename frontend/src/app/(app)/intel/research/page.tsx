'use client';

import { useState } from 'react';

import { RecentRunsList } from '@/components/intel/RecentRunsList';
import { StartResearchForm } from '@/components/intel/StartResearchForm';

export default function IntelResearchPage(): JSX.Element {
  const [runIds, setRunIds] = useState<string[]>([]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Investigar empresa</h1>
        <p className="text-text-muted text-sm">
          Pega la URL pública de una empresa para lanzar el enriquecimiento y seguir el progreso de
          la investigación en esta sesión.
        </p>
      </div>

      <StartResearchForm
        onRunCreated={(runId) => {
          setRunIds((current) => [runId, ...current.filter((id) => id !== runId)]);
        }}
      />

      <RecentRunsList runIds={runIds} />
    </div>
  );
}

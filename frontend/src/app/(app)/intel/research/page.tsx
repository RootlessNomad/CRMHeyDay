'use client';

import { useState } from 'react';

import { BulkImportForm } from '@/components/intel/BulkImportForm';
import { RecentRunsList } from '@/components/intel/RecentRunsList';
import { StartResearchForm } from '@/components/intel/StartResearchForm';

type ResearchTab = 'url' | 'csv';

export default function IntelResearchPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<ResearchTab>('url');
  const [runIds, setRunIds] = useState<string[]>([]);

  function prependRunIds(nextRunIds: string[]): void {
    setRunIds((current) => [...nextRunIds, ...current.filter((id) => !nextRunIds.includes(id))]);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Investigar empresa</h1>
        <p className="text-text-muted text-sm">
          Lanza investigaciones desde una URL o importando un CSV y sigue el progreso en esta
          sesión.
        </p>
      </div>

      <div className="border-border bg-surface inline-flex rounded-xl border p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('url')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'url' ? 'bg-accent text-white' : 'text-text-muted hover:text-foreground'
          }`}
        >
          URL
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('csv')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'csv' ? 'bg-accent text-white' : 'text-text-muted hover:text-foreground'
          }`}
        >
          CSV
        </button>
      </div>

      {activeTab === 'url' ? (
        <StartResearchForm
          onRunCreated={(runId, _companyId) => {
            prependRunIds([runId]);
          }}
        />
      ) : (
        <BulkImportForm onBatchCreated={prependRunIds} />
      )}

      <RecentRunsList runIds={runIds} />
    </div>
  );
}

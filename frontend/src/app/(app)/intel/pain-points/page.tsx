'use client';

import { PainPointsTable } from '@/components/intel/PainPointsTable';

export default function IntelPainPointsPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Pain Points</h1>
        <p className="text-text-muted text-sm">
          Revisa, verifica y depura los pain points detectados por IA antes de usarlos en tu
          pipeline comercial.
        </p>
      </div>

      <PainPointsTable />
    </div>
  );
}

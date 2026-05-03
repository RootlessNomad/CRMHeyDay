'use client';

import { useState } from 'react';

import { ServiceFitList } from '@/components/intel/ServiceFitList';

export default function IntelServiceFitPage(): JSX.Element {
  const [companyId, setCompanyId] = useState('');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Service Fit</h1>
        <p className="text-text-muted text-sm">
          Regenera y revisa qué líneas de servicio encajan mejor con una empresa concreta.
        </p>
      </div>

      <section className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
        <label className="block space-y-2">
          <span className="text-text-muted text-xs font-medium uppercase tracking-[0.14em]">
            Company ID
          </span>
          <input
            type="text"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            placeholder="ID de empresa"
            className="border-border bg-bg focus:border-accent h-11 w-full rounded-md border px-3 text-sm outline-none transition"
          />
        </label>
      </section>

      {companyId.trim() ? (
        <ServiceFitList companyId={companyId} />
      ) : (
        <div className="border-border bg-surface rounded-2xl border p-8 text-center shadow-sm">
          <p className="text-text-muted text-sm">
            Selecciona una empresa para ver sus recomendaciones.
          </p>
        </div>
      )}
    </div>
  );
}

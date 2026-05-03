'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { OutboundPrepCard } from '@/components/intel/OutboundPrepCard';
import { getCompany, listCompanies } from '@/lib/api/companies';
import type { CompanyDto } from '@/types/company';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function IntelOutboundPage(): JSX.Element {
  const [query, setQuery] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [matches, setMatches] = useState<CompanyDto[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const term = query.trim();
    if (!term) {
      setCompanyId(null);
      setMatches([]);
      return;
    }

    setIsSearching(true);
    try {
      try {
        const company = await getCompany(term);
        setCompanyId(company.id);
        setMatches([company]);
        return;
      } catch {
        const result = await listCompanies({ q: term, pageSize: 8 });
        setMatches(result.items);
        setCompanyId(result.items.length === 1 ? (result.items[0]?.id ?? null) : null);
        if (result.items.length === 0) {
          toast.error('No se encontraron empresas con ese criterio.');
        }
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudo buscar la empresa.'));
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Outbound Prep</h1>
        <p className="text-text-muted text-sm">
          Vista priorizada del briefing de outreach por empresa.
        </p>
      </header>

      <section className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
        <form
          onSubmit={(event) => void handleSearch(event)}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ID o nombre de empresa"
            className="border-border bg-bg h-11 flex-1 rounded-md border px-3 text-sm outline-none transition focus:border-[var(--color-accent)]"
          />
          <button
            type="submit"
            disabled={isSearching}
            className="bg-accent h-11 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSearching ? 'Buscando…' : 'Buscar'}
          </button>
        </form>

        {matches.length > 1 ? (
          <div className="mt-4 space-y-2">
            <p className="text-text-muted text-xs uppercase tracking-[0.14em]">
              Selecciona una empresa
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {matches.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => setCompanyId(company.id)}
                  className="border-border bg-bg hover:bg-surface-muted rounded-xl border px-4 py-3 text-left transition"
                >
                  <p className="text-sm font-medium">{company.name}</p>
                  <p className="text-text-muted mt-1 text-xs">{company.id}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {companyId ? <OutboundPrepCard companyId={companyId} /> : null}
    </div>
  );
}

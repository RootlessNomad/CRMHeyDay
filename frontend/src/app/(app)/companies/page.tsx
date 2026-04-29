'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { CompanyFormDialog } from '@/components/companies/CompanyFormDialog';
import { ImportCompaniesDialog } from '@/components/imports/ImportCompaniesDialog';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { listCompanies } from '@/lib/api/companies';
import { useAuthStore } from '@/lib/auth/store';
import { ICP_VERTICALS, type CompanyListQuery, type IcpVertical } from '@/types/company';

const VERTICAL_LABELS: Record<IcpVertical, string> = {
  physiotherapy: 'Fisioterapia',
  pilates: 'Pilates',
  yoga: 'Yoga',
  gym_fitness: 'Gym & Fitness',
  bakery: 'Panadería',
  cafe: 'Cafetería',
  other: 'Otro',
};

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
}

function formatRelativeDate(input: string): string {
  const date = new Date(input);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, 'day');

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return formatter.format(diffMonths, 'month');

  const diffYears = Math.round(diffMonths / 12);
  return formatter.format(diffYears, 'year');
}

function buildSearchParams(query: CompanyListQuery): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '' || value === 1) continue;
    params.set(key, String(value));
  }

  return params.toString();
}

export default function CompaniesPage(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const { saveFilters, loadFilters, clearFilters } = usePersistedFilters(
    'companies',
    currentUser?.id,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [qInput, setQInput] = useState(searchParams.get('q') ?? '');
  const [cityInput, setCityInput] = useState(searchParams.get('city') ?? '');
  const restoredFiltersRef = useRef(false);

  useEffect(() => {
    setQInput(searchParams.get('q') ?? '');
    setCityInput(searchParams.get('city') ?? '');
  }, [searchParams]);

  const debouncedQ = useDebouncedValue(qInput, 300).trim();
  const debouncedCity = useDebouncedValue(cityInput, 300).trim();
  const icpVerticalParam = searchParams.get('icp_vertical');
  const icpVertical = ICP_VERTICALS.includes(icpVerticalParam as IcpVertical)
    ? (icpVerticalParam as IcpVertical)
    : undefined;
  const page = Math.max(Number(searchParams.get('page') ?? '1') || 1, 1);
  const pageSize = Math.max(Number(searchParams.get('pageSize') ?? '20') || 20, 1);

  const query = useMemo<CompanyListQuery>(
    () => ({
      q: debouncedQ || undefined,
      icp_vertical: icpVertical,
      city: debouncedCity || undefined,
      page,
      pageSize,
      sort: 'updated_at_desc',
    }),
    [debouncedCity, debouncedQ, icpVertical, page, pageSize],
  );

  useEffect(() => {
    if (restoredFiltersRef.current) return;
    restoredFiltersRef.current = true;
    if (searchParams.toString() !== '') return;

    const saved = loadFilters();
    if (!saved) return;

    router.replace(`${pathname}?${saved}`);
  }, [loadFilters, pathname, router, searchParams]);

  useEffect(() => {
    const next = buildSearchParams(query);
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [pathname, query, router, searchParams]);

  useEffect(() => {
    saveFilters(new URLSearchParams(searchParams.toString()));
  }, [searchParams, saveFilters]);

  const companiesQuery = useQuery({
    queryKey: ['companies', query],
    queryFn: () => listCompanies(query),
  });

  function replaceSearch(next: Record<string, string | null>): void {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(next)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const serialized = params.toString();
    router.replace(serialized ? `${pathname}?${serialized}` : pathname);
  }

  async function handleCreated(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['companies'] });
    setCreateOpen(false);
  }

  const data = companiesQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasActiveFilters = Boolean(query.q || query.icp_vertical || query.city);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
            <span className="border-border bg-surface-muted rounded-full border px-2.5 py-1 text-xs font-medium">
              {data?.total ?? 0}
            </span>
          </div>
          <p className="text-text-muted mt-1 text-sm">
            Busca, crea y mantiene el inventario comercial de HeyDay.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
          >
            Importar CSV
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Nueva empresa
          </button>
          <button
            type="button"
            disabled
            title="Próximamente UJ-16"
            className="border-border bg-surface-muted text-text-muted h-10 rounded-md border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
          >
            Investigar URL
          </button>
        </div>
      </div>

      <div className="border-border bg-surface rounded-lg border p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                clearFilters();
                router.replace(pathname);
              }}
              className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
            >
              Restablecer
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="companies-q" className="block text-sm font-medium">
              Buscar
            </label>
            <input
              id="companies-q"
              value={qInput}
              onChange={(event) => {
                setQInput(event.target.value);
                replaceSearch({ page: null, q: event.target.value || null });
              }}
              placeholder="Nombre, dominio o ciudad"
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="companies-vertical" className="block text-sm font-medium">
              Vertical ICP
            </label>
            <select
              id="companies-vertical"
              value={icpVertical ?? ''}
              onChange={(event) => {
                replaceSearch({ icp_vertical: event.target.value || null, page: null });
              }}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            >
              <option value="">Todas</option>
              {ICP_VERTICALS.map((vertical) => (
                <option key={vertical} value={vertical}>
                  {VERTICAL_LABELS[vertical]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="companies-city" className="block text-sm font-medium">
              Ciudad
            </label>
            <input
              id="companies-city"
              value={cityInput}
              onChange={(event) => {
                setCityInput(event.target.value);
                replaceSearch({ city: event.target.value || null, page: null });
              }}
              placeholder="Madrid, Barcelona…"
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
          </div>
        </div>
      </div>

      <div className="border-border bg-surface rounded-lg border shadow-sm">
        {companiesQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="bg-surface-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : companiesQuery.isError ? (
          <div className="p-8 text-center">
            <p className="text-sm">No se pudieron cargar las empresas.</p>
          </div>
        ) : data && data.total === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
            <div>
              <h2 className="text-lg font-semibold">
                {hasActiveFilters ? 'No hay resultados para tus filtros.' : 'Aún no hay empresas'}
              </h2>
              <p className="text-text-muted mt-1 text-sm">
                {hasActiveFilters
                  ? 'Prueba otra combinación de búsqueda, ciudad o vertical.'
                  : 'Empieza creando el primer registro del CRM.'}
              </p>
            </div>
            {!hasActiveFilters ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
              >
                Crear tu primera empresa
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-border text-text-muted border-b text-left">
                  <tr>
                    <th className="px-5 py-3 font-medium">Nombre</th>
                    <th className="px-5 py-3 font-medium">Dominio</th>
                    <th className="px-5 py-3 font-medium">Ciudad</th>
                    <th className="px-5 py-3 font-medium">Vertical</th>
                    <th className="px-5 py-3 font-medium">Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((company) => (
                    <tr key={company.id} className="border-border border-b last:border-b-0">
                      <td className="px-5 py-4">
                        <Link
                          href={`/companies/${company.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {company.name}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        {company.domain ? (
                          <a
                            href={`https://${company.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-muted underline underline-offset-4"
                          >
                            {company.domain}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-4">{company.city ?? '—'}</td>
                      <td className="px-5 py-4">
                        {company.icp_vertical ? (
                          <span className="bg-accent-soft text-text inline-flex rounded-full px-2.5 py-1 text-xs font-medium">
                            {VERTICAL_LABELS[company.icp_vertical]}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-text-muted px-5 py-4">
                        {formatRelativeDate(company.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-border flex items-center justify-between border-t px-5 py-4">
              <button
                type="button"
                onClick={() => replaceSearch({ page: String(page - 1) })}
                disabled={page <= 1}
                className="border-border bg-surface-muted h-10 rounded-md border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <p className="text-text-muted text-sm">
                Página {data?.page ?? 1} de {totalPages}
              </p>
              <button
                type="button"
                onClick={() => replaceSearch({ page: String(page + 1) })}
                disabled={page >= totalPages}
                className="border-border bg-surface-muted h-10 rounded-md border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>

      <CompanyFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        onSuccess={() => {
          void handleCreated();
        }}
      />
      <ImportCompaniesDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setImportOpen(false);
          return queryClient.invalidateQueries({ queryKey: ['companies'] });
        }}
      />
    </div>
  );
}

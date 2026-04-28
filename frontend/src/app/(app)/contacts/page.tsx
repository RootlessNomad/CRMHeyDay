'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { ContactFormDialog } from '@/components/contacts/ContactFormDialog';
import { listContacts } from '@/lib/api/contacts';
import type { ContactListQuery } from '@/types/contact';

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

function buildSearchParams(query: ContactListQuery): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '' || value === 1) continue;
    params.set(key, String(value));
  }

  return params.toString();
}

type PrimaryFilter = '' | 'true' | 'false';

export default function ContactsPage(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [qInput, setQInput] = useState(searchParams.get('q') ?? '');

  useEffect(() => {
    setQInput(searchParams.get('q') ?? '');
  }, [searchParams]);

  const debouncedQ = useDebouncedValue(qInput, 300).trim();
  const primaryParam = searchParams.get('is_primary');
  const isPrimaryFilter: PrimaryFilter =
    primaryParam === 'true' || primaryParam === 'false' ? primaryParam : '';
  const page = Math.max(Number(searchParams.get('page') ?? '1') || 1, 1);
  const pageSize = Math.max(Number(searchParams.get('pageSize') ?? '20') || 20, 1);

  const query = useMemo<ContactListQuery>(
    () => ({
      q: debouncedQ || undefined,
      is_primary: isPrimaryFilter === '' ? undefined : isPrimaryFilter === 'true' ? true : false,
      page,
      pageSize,
      sort: 'updated_at_desc',
    }),
    [debouncedQ, isPrimaryFilter, page, pageSize],
  );

  useEffect(() => {
    const next = buildSearchParams(query);
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [pathname, query, router, searchParams]);

  const contactsQuery = useQuery({
    queryKey: ['contacts', query],
    queryFn: () => listContacts(query),
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
    await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    setCreateOpen(false);
  }

  const data = contactsQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasActiveFilters = Boolean(query.q || query.is_primary !== undefined);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Contactos</h1>
            <span className="border-border bg-surface-muted rounded-full border px-2.5 py-1 text-xs font-medium">
              {data?.total ?? 0}
            </span>
          </div>
          <p className="text-text-muted mt-1 text-sm">
            Gestiona las personas de contacto asociadas al pipeline comercial.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Nuevo contacto
          </button>
        </div>
      </div>

      <div className="border-border bg-surface rounded-lg border p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="contacts-q" className="block text-sm font-medium">
              Buscar
            </label>
            <input
              id="contacts-q"
              value={qInput}
              onChange={(event) => {
                setQInput(event.target.value);
                replaceSearch({ page: null, q: event.target.value || null });
              }}
              placeholder="Nombre, apellido o email"
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="contacts-primary" className="block text-sm font-medium">
              Contacto principal
            </label>
            <select
              id="contacts-primary"
              value={isPrimaryFilter}
              onChange={(event) => {
                replaceSearch({ is_primary: event.target.value || null, page: null });
              }}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            >
              <option value="">Todos</option>
              <option value="true">Solo primary</option>
              <option value="false">Solo no-primary</option>
            </select>
          </div>
        </div>
      </div>

      <div className="border-border bg-surface rounded-lg border shadow-sm">
        {contactsQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="bg-surface-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : contactsQuery.isError ? (
          <div className="p-8 text-center">
            <p className="text-sm">No se pudieron cargar los contactos.</p>
          </div>
        ) : data && data.total === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
            <div>
              <h2 className="text-lg font-semibold">
                {hasActiveFilters ? 'No hay resultados para tus filtros.' : 'Aún no hay contactos'}
              </h2>
              <p className="text-text-muted mt-1 text-sm">
                {hasActiveFilters
                  ? 'Prueba otra combinación de búsqueda o estado de contacto principal.'
                  : 'Empieza creando el primer contacto del CRM.'}
              </p>
            </div>
            {!hasActiveFilters ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
              >
                Crear tu primer contacto
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
                    <th className="px-5 py-3 font-medium">Empresa</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Teléfono</th>
                    <th className="px-5 py-3 font-medium">Primary</th>
                    <th className="px-5 py-3 font-medium">Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((contact) => (
                    <tr key={contact.id} className="border-border border-b last:border-b-0">
                      <td className="px-5 py-4">
                        <Link
                          href={`/contacts/${contact.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {[contact.first_name, contact.last_name].filter(Boolean).join(' ')}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        {contact.company_id ? (
                          <Link
                            href={`/companies/${contact.company_id}`}
                            className="underline underline-offset-4"
                          >
                            {contact.company_id}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-4">{contact.email ?? '—'}</td>
                      <td className="px-5 py-4">{contact.phone ?? '—'}</td>
                      <td className="px-5 py-4">
                        {contact.is_primary ? (
                          <span className="bg-accent-soft inline-flex rounded-full px-2.5 py-1 text-xs font-medium">
                            Primary
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-text-muted px-5 py-4">
                        {formatRelativeDate(contact.updated_at)}
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

      <ContactFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        onSuccess={() => {
          void handleCreated();
        }}
      />
    </div>
  );
}

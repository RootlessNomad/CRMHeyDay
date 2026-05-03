'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { CalendarItemBadge } from '@/components/content/CalendarItemBadge';
import { CHANNEL_LABELS, ITEM_STATUS_LABELS, getPillars, listLibrary } from '@/lib/api/content';

const PAGE_SIZE = 24;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export default function ContentLibraryPage(): JSX.Element {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [pillarId, setPillarId] = useState('');
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      setQ(qInput.trim());
      setOffset(0);
    }, 300);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [qInput]);

  const pillarsQuery = useQuery({
    queryKey: ['content', 'pillars'],
    queryFn: getPillars,
  });

  const libraryQuery = useQuery({
    queryKey: ['content', 'library', q, channel, status, pillarId, offset],
    queryFn: () =>
      listLibrary({
        q: q || undefined,
        channel: channel || undefined,
        status: status || undefined,
        pillar_id: pillarId || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const items = libraryQuery.data?.items ?? [];
  const total = libraryQuery.data?.total ?? 0;
  const shown = total === 0 ? 0 : Math.min(offset + items.length, total);
  const canGoPrev = offset > 0;
  const canGoNext = offset + PAGE_SIZE < total;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Biblioteca de contenido</h1>
        <p className="text-text-muted text-sm">
          Todos los borradores, piezas aprobadas y exportaciones en una sola vista.
        </p>
      </header>

      <section className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1">
            <span className="text-text-muted block text-xs font-medium uppercase tracking-[0.14em]">
              Buscar
            </span>
            <input
              type="search"
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              placeholder="Buscar por título"
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
              aria-label="Buscar contenido"
            />
          </label>

          <label className="space-y-1">
            <span className="text-text-muted block text-xs font-medium uppercase tracking-[0.14em]">
              Canal
            </span>
            <select
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value);
                setOffset(0);
              }}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
              aria-label="Filtrar por canal"
            >
              <option value="">Todos</option>
              {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-text-muted block text-xs font-medium uppercase tracking-[0.14em]">
              Estado
            </span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
              aria-label="Filtrar por estado"
            >
              <option value="">Todos</option>
              {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-text-muted block text-xs font-medium uppercase tracking-[0.14em]">
              Pilar
            </span>
            <select
              value={pillarId}
              onChange={(event) => {
                setPillarId(event.target.value);
                setOffset(0);
              }}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
              aria-label="Filtrar por pilar"
            >
              <option value="">Todos</option>
              {(pillarsQuery.data ?? []).map((pillar) => (
                <option key={pillar.id} value={pillar.id}>
                  {pillar.label_es}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {libraryQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="border-border bg-surface animate-pulse rounded-2xl border p-5 shadow-sm"
            >
              <div className="bg-surface-muted h-5 w-28 rounded-full" />
              <div className="bg-surface-muted mt-4 h-5 w-4/5 rounded" />
              <div className="bg-surface-muted mt-3 h-4 w-2/5 rounded" />
              <div className="bg-surface-muted mt-6 h-4 w-1/2 rounded" />
            </div>
          ))}
        </div>
      ) : null}

      {libraryQuery.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm text-red-700">
            {libraryQuery.error instanceof Error
              ? libraryQuery.error.message
              : 'No se pudo cargar la biblioteca.'}
          </p>
        </div>
      ) : null}

      {!libraryQuery.isLoading && !libraryQuery.isError ? (
        items.length === 0 ? (
          <div className="border-border bg-surface rounded-2xl border p-10 text-center shadow-sm">
            <p className="text-sm font-medium">No hay contenido con estos filtros.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`/content/items/${item.id}`}
                  className="border-border bg-surface block rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="space-y-4">
                    <CalendarItemBadge
                      channel={item.channel as 'instagram' | 'linkedin' | 'newsletter'}
                      status={item.status}
                    />
                    <div className="space-y-1">
                      <p className="truncate font-medium">{item.idea_title}</p>
                      <p className="text-text-muted text-xs">{item.pillar_label}</p>
                    </div>
                    <div className="text-text-muted text-xs">
                      {item.scheduled_for
                        ? `Programado para ${formatDate(item.scheduled_for)}`
                        : 'Sin fecha programada'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                disabled={!canGoPrev}
                className="border-border bg-surface-muted rounded-md border px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-text-muted text-sm">
                {shown} de {total} resultados
              </span>
              <button
                type="button"
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
                disabled={!canGoNext}
                className="border-border bg-surface-muted rounded-md border px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

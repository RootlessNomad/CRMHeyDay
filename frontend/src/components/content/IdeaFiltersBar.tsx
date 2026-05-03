'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  IDEA_STATUS_LABELS,
  VERTICAL_LABELS,
  getPillars,
  type IdeaListQuery,
} from '@/lib/api/content';

export type IdeaFiltersValue = Pick<IdeaListQuery, 'status' | 'pillar_id' | 'vertical' | 'q'>;

interface IdeaFiltersBarProps {
  value: IdeaFiltersValue;
  onChange: (value: IdeaFiltersValue) => void;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
}

export function IdeaFiltersBar({ value, onChange }: IdeaFiltersBarProps): JSX.Element {
  const pillarsQuery = useQuery({
    queryKey: ['content', 'pillars'],
    queryFn: getPillars,
  });
  const [qInput, setQInput] = useState(value.q ?? '');
  const debouncedQ = useDebouncedValue(qInput, 300);

  useEffect(() => {
    setQInput(value.q ?? '');
  }, [value.q]);

  useEffect(() => {
    const nextQ = debouncedQ.trim();
    if ((value.q ?? '') === nextQ) return;
    onChange({ ...value, q: nextQ || undefined });
  }, [debouncedQ, onChange, value]);

  return (
    <section className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1">
          <span className="text-text-muted block text-xs font-medium uppercase tracking-[0.14em]">
            Estado
          </span>
          <select
            value={value.status ?? ''}
            onChange={(event) => onChange({ ...value, status: event.target.value || undefined })}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
            aria-label="Filtrar por estado"
          >
            <option value="">Todos</option>
            {Object.entries(IDEA_STATUS_LABELS).map(([status, label]) => (
              <option key={status} value={status}>
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
            value={value.pillar_id ?? ''}
            onChange={(event) => onChange({ ...value, pillar_id: event.target.value || undefined })}
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

        <label className="space-y-1">
          <span className="text-text-muted block text-xs font-medium uppercase tracking-[0.14em]">
            Vertical
          </span>
          <select
            value={value.vertical ?? ''}
            onChange={(event) => onChange({ ...value, vertical: event.target.value || undefined })}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
            aria-label="Filtrar por vertical"
          >
            <option value="">Todas</option>
            {Object.entries(VERTICAL_LABELS).map(([vertical, label]) => (
              <option key={vertical} value={vertical}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-text-muted block text-xs font-medium uppercase tracking-[0.14em]">
            Buscar
          </span>
          <input
            type="search"
            value={qInput}
            onChange={(event) => setQInput(event.target.value)}
            placeholder="Título, ángulo o brief"
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
            aria-label="Buscar ideas"
          />
        </label>
      </div>
    </section>
  );
}

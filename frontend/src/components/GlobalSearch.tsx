'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { searchAll, type SearchHit, type SearchResults } from '@/lib/api/search';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

interface SearchSection {
  key: keyof Pick<SearchResults, 'companies' | 'contacts' | 'leads' | 'activities'>;
  label: string;
  hits: SearchHit[];
}

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

function destinationFor(hit: SearchHit): string {
  if (hit.type === 'company') return `/companies/${hit.id}`;
  if (hit.type === 'contact') return `/contacts/${hit.id}`;
  if (hit.type === 'lead') return `/leads/${hit.id}`;
  return '';
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps): JSX.Element {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlightedIndex(-1);
      return;
    }

    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [open]);

  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const searchQuery = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchAll(debouncedQuery, 10),
    enabled: open && debouncedQuery.length >= 2,
  });

  const sections = useMemo<SearchSection[]>(() => {
    const data = searchQuery.data;
    if (!data) return [];

    const nextSections: SearchSection[] = [
      { key: 'companies', label: 'Empresas', hits: data.companies },
      { key: 'contacts', label: 'Contactos', hits: data.contacts },
      { key: 'leads', label: 'Leads', hits: data.leads },
      { key: 'activities', label: 'Actividades', hits: data.activities },
    ];

    return nextSections.filter((section) => section.hits.length > 0);
  }, [searchQuery.data]);

  const flatResults = useMemo(() => sections.flatMap((section) => section.hits), [sections]);

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(flatResults.length > 0 ? 0 : -1);
  }, [flatResults, open]);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setQuery(event.target.value);
    setHighlightedIndex(-1);
  }

  function handleSelect(hit: SearchHit): void {
    const destination = destinationFor(hit);
    if (!destination) {
      toast.info(
        "Las actividades se editan desde la pestaña 'Actividad' de su empresa/contacto/lead.",
      );
      onClose();
      return;
    }

    router.push(destination);
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (flatResults.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % flatResults.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => (current <= 0 ? flatResults.length - 1 : current - 1));
      return;
    }

    if (event.key === 'Enter' && highlightedIndex >= 0) {
      event.preventDefault();
      const hit = flatResults[highlightedIndex];
      if (!hit) return;

      const destination = destinationFor(hit);
      if (!destination) {
        toast.info(
          "Las actividades se editan desde la pestaña 'Actividad' de su empresa/contacto/lead.",
        );
        return;
      }

      router.push(destination);
      onClose();
    }
  }

  function renderContent(): JSX.Element {
    if (query.trim().length < 2) {
      return (
        <div className="text-text-muted px-1 py-6 text-sm">Escribe al menos 2 caracteres.</div>
      );
    }

    if (searchQuery.isFetching && searchQuery.data === undefined) {
      return <div className="text-text-muted px-1 py-6 text-sm">Buscando…</div>;
    }

    if (searchQuery.isError) {
      return <div className="text-danger px-1 py-6 text-sm">No se pudo realizar la búsqueda.</div>;
    }

    if (flatResults.length === 0) {
      return <div className="text-text-muted px-1 py-6 text-sm">Sin coincidencias.</div>;
    }

    let offset = 0;

    return (
      <div role="listbox" className="space-y-4" aria-label="Resultados de búsqueda global">
        {sections.map((section) => {
          const startIndex = offset;
          offset += section.hits.length;

          return (
            <section key={section.key} className="space-y-2">
              <h3 className="text-text-muted px-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                {section.label}
              </h3>
              <div className="space-y-1">
                {section.hits.map((hit, index) => {
                  const flatIndex = startIndex + index;
                  const highlighted = flatIndex === highlightedIndex;

                  return (
                    <button
                      key={`${hit.type}-${hit.id}`}
                      type="button"
                      role="option"
                      aria-selected={highlighted}
                      onClick={() => handleSelect(hit)}
                      className={`w-full rounded-md px-3 py-2 text-left transition ${
                        highlighted ? 'bg-accent-soft' : 'hover:bg-surface-muted'
                      }`}
                    >
                      <div className="font-medium">{hit.title}</div>
                      {hit.subtitle ? (
                        <div className="text-text-muted mt-0.5 text-sm">{hit.subtitle}</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Búsqueda global" size="lg">
      <div className="space-y-4">
        <div className="relative">
          <Search className="text-text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Buscar empresas, contactos, leads, actividades…"
            className="border-border bg-bg focus:border-accent h-11 w-full rounded-md border pl-10 pr-3 text-sm outline-none transition"
            aria-label="Buscar empresas, contactos, leads, actividades"
          />
        </div>

        {renderContent()}
      </div>
    </Modal>
  );
}

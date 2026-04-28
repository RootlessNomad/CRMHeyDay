'use client';

import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';

import { listCompanies } from '@/lib/api/companies';

interface CompanyOption {
  id: string;
  name: string;
  domain?: string | null;
}

interface CompanyPickerProps {
  value: { id: string; name: string } | null;
  onChange: (next: { id: string; name: string } | null) => void;
  disabled?: boolean;
  error?: string;
  inputId?: string;
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

export function CompanyPicker({
  value,
  onChange,
  disabled = false,
  error,
  inputId,
}: CompanyPickerProps): JSX.Element {
  const generatedId = useId();
  const resolvedInputId = inputId ?? `company-picker-${generatedId}`;
  const listboxId = `${resolvedInputId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    if (!open && value) setQuery(value.name);
    if (!open && !value) setQuery('');
  }, [open, value]);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
      setHighlightedIndex(-1);
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, []);

  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const companiesQuery = useQuery({
    queryKey: ['companies', 'picker', debouncedQuery],
    queryFn: () => listCompanies({ q: debouncedQuery, pageSize: 8 }),
    enabled: debouncedQuery.length >= 1 && open,
  });

  const options = useMemo<CompanyOption[]>(
    () =>
      companiesQuery.data?.items.map((company) => ({
        id: company.id,
        name: company.name,
        domain: company.domain,
      })) ?? [],
    [companiesQuery.data],
  );

  useEffect(() => {
    if (options.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex(0);
  }, [options.length]);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setOpen(true);
    setHighlightedIndex(-1);
    if (value && nextQuery !== value.name) {
      onChange(null);
    }
  }

  function selectOption(option: CompanyOption): void {
    onChange({ id: option.id, name: option.name });
    setQuery(option.name);
    setOpen(false);
  }

  function clearSelection(): void {
    onChange(null);
    setQuery('');
    setOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      setOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    if (!open || options.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % options.length);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => (current <= 0 ? options.length - 1 : current - 1));
    }

    if (event.key === 'Enter' && highlightedIndex >= 0) {
      event.preventDefault();
      const option = options[highlightedIndex];
      if (option) selectOption(option);
    }
  }

  return (
    <div ref={rootRef} className="space-y-1.5">
      <div className="relative">
        <input
          id={resolvedInputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          value={query}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Buscar empresa…"
          className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 pr-20 text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
        />

        {value ? (
          <button
            type="button"
            onClick={clearSelection}
            disabled={disabled}
            className="text-text-muted hover:text-text absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium transition"
          >
            Limpiar
          </button>
        ) : null}

        {open ? (
          <div
            id={listboxId}
            role="listbox"
            className="border-border bg-surface absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20 max-h-64 overflow-auto rounded-md border p-1 shadow-lg"
          >
            {debouncedQuery.length < 1 ? (
              <div className="text-text-muted px-3 py-2 text-sm">Escribe al menos 1 carácter.</div>
            ) : companiesQuery.isLoading ? (
              <div className="text-text-muted px-3 py-2 text-sm">Buscando empresas…</div>
            ) : companiesQuery.isError ? (
              <div className="text-danger px-3 py-2 text-sm">No se pudo cargar el listado.</div>
            ) : options.length === 0 ? (
              <div className="text-text-muted px-3 py-2 text-sm">No hay resultados.</div>
            ) : (
              options.map((option, index) => {
                const selected = value?.id === option.id;
                const highlighted = index === highlightedIndex;

                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectOption(option)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                      highlighted ? 'bg-accent-soft' : 'hover:bg-surface-muted'
                    }`}
                  >
                    <div className="font-medium">{option.name}</div>
                    {option.domain ? (
                      <div className="text-text-muted text-xs">{option.domain}</div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      {value ? <p className="text-text-muted text-xs">Seleccionada: {value.name}</p> : null}
      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </div>
  );
}

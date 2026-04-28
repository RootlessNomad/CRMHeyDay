'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';

import { listContacts } from '../../lib/api/contacts';

interface ContactPickerProps {
  companyId: string | null;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  error?: string;
  inputId?: string;
}

interface ContactOption {
  id: string;
  label: string;
  meta: string | null;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
}

function toContactLabel(contact: {
  first_name: string;
  last_name: string | null;
  email: string | null;
}): ContactOption {
  const label = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  return {
    id: '',
    label,
    meta: contact.email,
  };
}

export function ContactPicker({
  companyId,
  value,
  onChange,
  disabled = false,
  error,
  inputId,
}: ContactPickerProps): JSX.Element {
  const generatedId = useId();
  const resolvedInputId = inputId ?? `lead-contact-picker-${generatedId}`;
  const listboxId = `${resolvedInputId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    setQuery('');
    setSelectedLabel('');
    setOpen(false);
    setHighlightedIndex(-1);
  }, [companyId]);

  useEffect(() => {
    if (!value) {
      setSelectedLabel('');
      if (!open) setQuery('');
    }
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

  const contactsQuery = useQuery({
    queryKey: ['contacts', 'picker', companyId, debouncedQuery],
    queryFn: async () => {
      const response = await listContacts({
        company_id: companyId ?? undefined,
        q: debouncedQuery,
        pageSize: 8,
      });

      return response.items.map((contact) => {
        const option = toContactLabel(contact);
        return {
          id: contact.id,
          label: option.label,
          meta: option.meta,
        };
      });
    },
    enabled: Boolean(companyId) && open && debouncedQuery.length >= 1,
  });

  const options = contactsQuery.data ?? [];

  useEffect(() => {
    if (options.length === 0) {
      setHighlightedIndex(-1);
      return;
    }

    setHighlightedIndex((current) => {
      if (current >= 0 && current < options.length) return current;
      return 0;
    });
  }, [options]);

  function selectOption(option: ContactOption): void {
    setSelectedLabel(option.label);
    setQuery(option.label);
    setOpen(false);
    setHighlightedIndex(-1);
    onChange(option.id);
  }

  function clearSelection(): void {
    setSelectedLabel('');
    setQuery('');
    setOpen(false);
    setHighlightedIndex(-1);
    onChange('');
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setOpen(true);
    setHighlightedIndex(-1);
    if (value && nextQuery !== selectedLabel) {
      setSelectedLabel('');
      onChange('');
    }
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

  if (!companyId) {
    return (
      <div className="space-y-1.5">
        <input
          id={resolvedInputId}
          value=""
          disabled
          placeholder="Selecciona empresa primero"
          className="border-border bg-bg h-10 w-full rounded-sm border px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        {error ? <p className="text-danger text-xs">{error}</p> : null}
      </div>
    );
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
          placeholder="Buscar contacto…"
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
            ) : contactsQuery.isLoading ? (
              <div className="text-text-muted px-3 py-2 text-sm">Buscando contactos…</div>
            ) : contactsQuery.isError ? (
              <div className="text-danger px-3 py-2 text-sm">No se pudo cargar el listado.</div>
            ) : options.length === 0 ? (
              <div className="text-text-muted px-3 py-2 text-sm">No hay resultados.</div>
            ) : (
              options.map((option, index) => {
                const selected = value === option.id;
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
                    <div className="font-medium">{option.label}</div>
                    {option.meta ? (
                      <div className="text-text-muted text-xs">{option.meta}</div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      {value && selectedLabel ? (
        <p className="text-text-muted text-xs">Seleccionado: {selectedLabel}</p>
      ) : null}
      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </div>
  );
}

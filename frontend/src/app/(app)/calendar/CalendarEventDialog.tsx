'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { CompanyPicker } from '@/components/contacts/CompanyPicker';
import {
  calendarEventInputSchema,
  createCalendarEvent,
  deleteCalendarEvent,
  type CalendarEventDto,
  type CalendarRelatedEntityType,
  updateCalendarEvent,
} from '@/lib/api/calendar';
import { getCompany } from '@/lib/api/companies';
import { getContact, listContacts } from '@/lib/api/contacts';
import { getLead, listLeads } from '@/lib/api/leads';
import { useAuthStore } from '@/lib/auth/store';

interface CalendarEventDialogProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  event?: CalendarEventDto;
  initialDate?: Date;
}

interface EntitySelection {
  id: string;
  label: string;
  hint?: string | null;
}

interface CalendarEventFormState {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  visibility: 'personal' | 'general';
  relatedEntityType: '' | CalendarRelatedEntityType;
  relatedEntityId: string;
  color: string;
}

type CalendarEventField =
  | 'title'
  | 'startsAt'
  | 'endsAt'
  | 'relatedEntityId'
  | 'description'
  | 'location'
  | 'color';
type CalendarEventErrors = Partial<Record<CalendarEventField, string>>;

interface SearchPickerProps {
  label: string;
  placeholder: string;
  disabled?: boolean;
  value: EntitySelection | null;
  onChange: (next: EntitySelection | null) => void;
  queryKeyPrefix: string;
  queryFn: (query: string) => Promise<EntitySelection[]>;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function toDateValue(value: string | null): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toIsoFromDateTimeLocal(value: string): string {
  return new Date(value).toISOString();
}

function toIsoFromDate(value: string, endOfDay = false): string {
  const parts = value.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  return date.toISOString();
}

function getDefaultDateTime(date: Date, hours: number): string {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, 0, 0, 0);
  return toDateTimeLocalValue(next.toISOString());
}

function getDefaultDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function createEmptyState(date: Date): CalendarEventFormState {
  return {
    title: '',
    description: '',
    location: '',
    startsAt: getDefaultDateTime(date, 9),
    endsAt: getDefaultDateTime(date, 10),
    allDay: false,
    visibility: 'personal',
    relatedEntityType: '',
    relatedEntityId: '',
    color: '',
  };
}

function stateFromEvent(event: CalendarEventDto): CalendarEventFormState {
  return {
    title: event.title,
    description: event.description ?? '',
    location: event.location ?? '',
    startsAt: event.allDay ? toDateValue(event.startsAt) : toDateTimeLocalValue(event.startsAt),
    endsAt: event.allDay ? toDateValue(event.endsAt) : toDateTimeLocalValue(event.endsAt),
    allDay: event.allDay,
    visibility: event.visibility,
    relatedEntityType: event.relatedEntityType ?? '',
    relatedEntityId: event.relatedEntityId ?? '',
    color: event.color ?? '',
  };
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
}

function SearchPicker({
  label,
  placeholder,
  disabled = false,
  value,
  onChange,
  queryKeyPrefix,
  queryFn,
}: SearchPickerProps): JSX.Element {
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(value?.label ?? '');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  useEffect(() => {
    if (!open) {
      setQuery(value?.label ?? '');
      setHighlightedIndex(-1);
    }
  }, [open, value]);

  useEffect(() => {
    function handleDocumentMouseDown(mouseEvent: MouseEvent): void {
      const target = mouseEvent.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, []);

  const optionsQuery = useQuery({
    queryKey: [queryKeyPrefix, debouncedQuery],
    queryFn: () => queryFn(debouncedQuery),
    enabled: open && debouncedQuery.length >= 1,
  });

  const options = optionsQuery.data ?? [];

  useEffect(() => {
    if (options.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex(0);
  }, [options.length]);

  function selectOption(option: EntitySelection): void {
    onChange(option);
    setQuery(option.label);
    setOpen(false);
  }

  function handleKeyDown(keyboardEvent: KeyboardEvent<HTMLInputElement>): void {
    if (keyboardEvent.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (!open || options.length === 0) return;

    if (keyboardEvent.key === 'ArrowDown') {
      keyboardEvent.preventDefault();
      setHighlightedIndex((current) => (current + 1) % options.length);
    }

    if (keyboardEvent.key === 'ArrowUp') {
      keyboardEvent.preventDefault();
      setHighlightedIndex((current) => (current <= 0 ? options.length - 1 : current - 1));
    }

    if (keyboardEvent.key === 'Enter' && highlightedIndex >= 0) {
      keyboardEvent.preventDefault();
      const option = options[highlightedIndex];
      if (option) selectOption(option);
    }
  }

  return (
    <div ref={rootRef} className="space-y-1.5">
      <label className="block text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
            if (value && nextQuery !== value.label) onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 pr-20 text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
        />

        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery('');
              setOpen(false);
            }}
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
            ) : optionsQuery.isLoading ? (
              <div className="text-text-muted px-3 py-2 text-sm">Buscando…</div>
            ) : optionsQuery.isError ? (
              <div className="text-danger px-3 py-2 text-sm">No se pudo cargar el listado.</div>
            ) : options.length === 0 ? (
              <div className="text-text-muted px-3 py-2 text-sm">No hay resultados.</div>
            ) : (
              options.map((option, index) => {
                const highlighted = index === highlightedIndex;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={value?.id === option.id}
                    onClick={() => selectOption(option)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                      highlighted ? 'bg-accent-soft' : 'hover:bg-surface-muted'
                    }`}
                  >
                    <div className="font-medium">{option.label}</div>
                    {option.hint ? (
                      <div className="text-text-muted text-xs">{option.hint}</div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>
      {value ? <p className="text-text-muted text-xs">Seleccionado: {value.label}</p> : null}
    </div>
  );
}

export function CalendarEventDialog({
  open,
  onClose,
  mode,
  event,
  initialDate,
}: CalendarEventDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const defaultDate = useMemo(() => initialDate ?? new Date(), [initialDate]);
  const [form, setForm] = useState<CalendarEventFormState>(() => createEmptyState(defaultDate));
  const [errors, setErrors] = useState<CalendarEventErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);
  const [selectedLead, setSelectedLead] = useState<EntitySelection | null>(null);
  const [selectedContact, setSelectedContact] = useState<EntitySelection | null>(null);

  const canEdit = useMemo(() => {
    if (mode === 'create') return true;
    if (!event || !currentUser) return false;
    if (event.visibility === 'personal') return event.ownerId === currentUser.id;
    return currentUser.role === 'admin';
  }, [currentUser, event, mode]);

  useEffect(() => {
    if (!open) return;

    setErrors({});
    setSubmitting(false);

    if (mode === 'edit' && event) {
      setForm(stateFromEvent(event));
      setSelectedCompany(
        event.relatedEntityType === 'company' && event.relatedEntityId
          ? { id: event.relatedEntityId, name: event.relatedEntityId }
          : null,
      );
      setSelectedLead(
        event.relatedEntityType === 'lead' && event.relatedEntityId
          ? { id: event.relatedEntityId, label: event.relatedEntityId }
          : null,
      );
      setSelectedContact(
        event.relatedEntityType === 'contact' && event.relatedEntityId
          ? { id: event.relatedEntityId, label: event.relatedEntityId }
          : null,
      );
      return;
    }

    setForm(createEmptyState(defaultDate));
    setSelectedCompany(null);
    setSelectedLead(null);
    setSelectedContact(null);
  }, [defaultDate, event, mode, open]);

  const companyQuery = useQuery({
    queryKey: ['companies', 'calendar', event?.relatedEntityId],
    queryFn: async () => {
      if (!event?.relatedEntityId) return null;
      return getCompany(event.relatedEntityId);
    },
    enabled:
      open &&
      mode === 'edit' &&
      event?.relatedEntityType === 'company' &&
      Boolean(event.relatedEntityId),
  });

  const leadQuery = useQuery({
    queryKey: ['leads', 'calendar', event?.relatedEntityId],
    queryFn: async () => {
      if (!event?.relatedEntityId) return null;
      return getLead(event.relatedEntityId);
    },
    enabled:
      open &&
      mode === 'edit' &&
      event?.relatedEntityType === 'lead' &&
      Boolean(event.relatedEntityId),
  });

  const contactQuery = useQuery({
    queryKey: ['contacts', 'calendar', event?.relatedEntityId],
    queryFn: async () => {
      if (!event?.relatedEntityId) return null;
      return getContact(event.relatedEntityId);
    },
    enabled:
      open &&
      mode === 'edit' &&
      event?.relatedEntityType === 'contact' &&
      Boolean(event.relatedEntityId),
  });

  useEffect(() => {
    if (companyQuery.data) {
      setSelectedCompany({ id: companyQuery.data.id, name: companyQuery.data.name });
    }
  }, [companyQuery.data]);

  useEffect(() => {
    if (leadQuery.data) {
      setSelectedLead({
        id: leadQuery.data.id,
        label: leadQuery.data.company?.name ?? leadQuery.data.id,
        hint: leadQuery.data.stage?.name ?? null,
      });
    }
  }, [leadQuery.data]);

  useEffect(() => {
    if (contactQuery.data) {
      setSelectedContact({
        id: contactQuery.data.id,
        label: [contactQuery.data.first_name, contactQuery.data.last_name]
          .filter(Boolean)
          .join(' '),
        hint: contactQuery.data.email,
      });
    }
  }, [contactQuery.data]);

  function handleInputChange(
    changeEvent: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void {
    const { name, value } = changeEvent.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  function handleAllDayToggle(): void {
    setForm((current) => {
      if (current.allDay) {
        const sourceDate = current.startsAt
          ? new Date(toIsoFromDate(current.startsAt))
          : defaultDate;
        return {
          ...current,
          allDay: false,
          startsAt: getDefaultDateTime(sourceDate, 9),
          endsAt: getDefaultDateTime(sourceDate, 10),
        };
      }

      const sourceDate = current.startsAt ? new Date(current.startsAt) : defaultDate;
      const dateValue = getDefaultDate(sourceDate);
      return {
        ...current,
        allDay: true,
        startsAt: dateValue,
        endsAt: current.endsAt ? getDefaultDate(new Date(current.endsAt)) : dateValue,
      };
    });
    setErrors((current) => ({ ...current, startsAt: undefined, endsAt: undefined }));
  }

  function handleRelatedEntityTypeChange(nextType: '' | CalendarRelatedEntityType): void {
    setForm((current) => ({
      ...current,
      relatedEntityType: nextType,
      relatedEntityId: '',
    }));
    setSelectedCompany(null);
    setSelectedLead(null);
    setSelectedContact(null);
    setErrors((current) => ({ ...current, relatedEntityId: undefined }));
  }

  async function handleSubmit(submitEvent: FormEvent<HTMLFormElement>): Promise<void> {
    submitEvent.preventDefault();
    if (!canEdit) return;

    setErrors({});

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      location: form.location.trim() || undefined,
      startsAt: form.startsAt
        ? form.allDay
          ? toIsoFromDate(form.startsAt, false)
          : toIsoFromDateTimeLocal(form.startsAt)
        : '',
      endsAt: form.endsAt
        ? form.allDay
          ? toIsoFromDate(form.endsAt, true)
          : toIsoFromDateTimeLocal(form.endsAt)
        : '',
      allDay: form.allDay,
      visibility: form.visibility,
      relatedEntityType: form.relatedEntityType || undefined,
      relatedEntityId: form.relatedEntityId || undefined,
      color: form.color || undefined,
    };

    const parsed = calendarEventInputSchema.safeParse(payload);

    if (!parsed.success) {
      const nextErrors: CalendarEventErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          nextErrors[field as CalendarEventField] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'create') {
        await createCalendarEvent(parsed.data);
      } else if (event) {
        await updateCalendarEvent(event.id, parsed.data);
      }

      await queryClient.invalidateQueries({ queryKey: ['calendar', 'events'] });
      toast.success(mode === 'create' ? 'Evento creado.' : 'Evento actualizado.');
      onClose();
    } catch {
      toast.error('No se pudo guardar el evento.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!event || !canEdit) return;
    if (!window.confirm('¿Eliminar este evento?')) return;

    setSubmitting(true);
    try {
      await deleteCalendarEvent(event.id);
      await queryClient.invalidateQueries({ queryKey: ['calendar', 'events'] });
      toast.success('Evento eliminado.');
      onClose();
    } catch {
      toast.error('No se pudo eliminar el evento.');
    } finally {
      setSubmitting(false);
    }
  }

  async function searchLeads(query: string): Promise<EntitySelection[]> {
    const response = await listLeads({ q: query, pageSize: 8 });
    return response.items.map((lead) => ({
      id: lead.id,
      label: lead.company?.name ?? lead.id,
      hint: lead.stage?.name ?? null,
    }));
  }

  async function searchContacts(query: string): Promise<EntitySelection[]> {
    const response = await listContacts({ q: query, pageSize: 8, sort: 'updated_at_desc' });
    return response.items.map((contact) => ({
      id: contact.id,
      label: [contact.first_name, contact.last_name].filter(Boolean).join(' '),
      hint: contact.email,
    }));
  }

  function renderFieldError(field: CalendarEventField): JSX.Element | null {
    const message = errors[field];
    if (!message) return null;
    return <p className="text-danger text-xs">{message}</p>;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Nuevo evento' : canEdit ? 'Editar evento' : 'Detalle del evento'}
      size="lg"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="calendar-title" className="block text-sm font-medium">
              Título
            </label>
            <input
              id="calendar-title"
              name="title"
              value={form.title}
              onChange={handleInputChange}
              disabled={submitting || !canEdit}
              aria-invalid={Boolean(errors.title)}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderFieldError('title')}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="calendar-description" className="block text-sm font-medium">
              Descripción
            </label>
            <textarea
              id="calendar-description"
              name="description"
              rows={3}
              value={form.description}
              onChange={handleInputChange}
              disabled={submitting || !canEdit}
              className="border-border bg-bg focus:border-accent w-full rounded-sm border px-3 py-2 text-sm outline-none transition"
            />
            {renderFieldError('description')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="calendar-location" className="block text-sm font-medium">
              Ubicación
            </label>
            <input
              id="calendar-location"
              name="location"
              value={form.location}
              onChange={handleInputChange}
              disabled={submitting || !canEdit}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderFieldError('location')}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Color</label>
            <div className="flex items-center gap-3">
              <input
                aria-label="Color"
                type="color"
                value={form.color || '#2563eb'}
                onChange={(event) => {
                  setForm((current) => ({ ...current, color: event.target.value }));
                  setErrors((current) => ({ ...current, color: undefined }));
                }}
                disabled={submitting || !canEdit}
                className="border-border bg-bg h-10 w-14 rounded-sm border p-1"
              />
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, color: '' }))}
                disabled={submitting || !canEdit}
                className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-3 text-sm transition"
              >
                Quitar
              </button>
            </div>
            <p className="text-text-muted text-xs">Vacío usa el color por defecto.</p>
            {renderFieldError('color')}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="calendar-all-day"
            type="checkbox"
            checked={form.allDay}
            onChange={handleAllDayToggle}
            disabled={submitting || !canEdit}
          />
          <label htmlFor="calendar-all-day" className="text-sm font-medium">
            Todo el día
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="calendar-startsAt" className="block text-sm font-medium">
              Inicio
            </label>
            <input
              id="calendar-startsAt"
              name="startsAt"
              type={form.allDay ? 'date' : 'datetime-local'}
              value={form.startsAt}
              onChange={handleInputChange}
              disabled={submitting || !canEdit}
              aria-invalid={Boolean(errors.startsAt)}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderFieldError('startsAt')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="calendar-endsAt" className="block text-sm font-medium">
              Fin
            </label>
            <input
              id="calendar-endsAt"
              name="endsAt"
              type={form.allDay ? 'date' : 'datetime-local'}
              value={form.endsAt}
              onChange={handleInputChange}
              disabled={submitting || !canEdit}
              aria-invalid={Boolean(errors.endsAt)}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderFieldError('endsAt')}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium">Visibilidad</span>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                checked={form.visibility === 'personal'}
                onChange={() => setForm((current) => ({ ...current, visibility: 'personal' }))}
                disabled={submitting || !canEdit}
              />
              Personal
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                checked={form.visibility === 'general'}
                onChange={() => setForm((current) => ({ ...current, visibility: 'general' }))}
                disabled={submitting || !canEdit}
              />
              General
            </label>
          </div>
        </div>

        <div className="border-border bg-surface rounded-lg border p-4">
          <div className="mb-3">
            <span className="block text-sm font-medium">Entidad relacionada</span>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="relatedEntityType"
                checked={form.relatedEntityType === ''}
                onChange={() => handleRelatedEntityTypeChange('')}
                disabled={submitting || !canEdit}
              />
              Ninguna
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="relatedEntityType"
                checked={form.relatedEntityType === 'lead'}
                onChange={() => handleRelatedEntityTypeChange('lead')}
                disabled={submitting || !canEdit}
              />
              Lead
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="relatedEntityType"
                checked={form.relatedEntityType === 'company'}
                onChange={() => handleRelatedEntityTypeChange('company')}
                disabled={submitting || !canEdit}
              />
              Empresa
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="relatedEntityType"
                checked={form.relatedEntityType === 'contact'}
                onChange={() => handleRelatedEntityTypeChange('contact')}
                disabled={submitting || !canEdit}
              />
              Contacto
            </label>
          </div>

          <div className="mt-4">
            {form.relatedEntityType === 'company' ? (
              <CompanyPicker
                value={selectedCompany}
                onChange={(next) => {
                  setSelectedCompany(next);
                  setForm((current) => ({
                    ...current,
                    relatedEntityId: next?.id ?? '',
                  }));
                  setErrors((current) => ({ ...current, relatedEntityId: undefined }));
                }}
                disabled={submitting || !canEdit}
                error={errors.relatedEntityId}
                inputId="calendar-related-company"
              />
            ) : form.relatedEntityType === 'lead' ? (
              <>
                <SearchPicker
                  label="Lead"
                  placeholder="Buscar lead…"
                  disabled={submitting || !canEdit}
                  value={selectedLead}
                  onChange={(next) => {
                    setSelectedLead(next);
                    setForm((current) => ({
                      ...current,
                      relatedEntityId: next?.id ?? '',
                    }));
                    setErrors((current) => ({ ...current, relatedEntityId: undefined }));
                  }}
                  queryKeyPrefix="calendar-related-leads"
                  queryFn={searchLeads}
                />
                {renderFieldError('relatedEntityId')}
              </>
            ) : form.relatedEntityType === 'contact' ? (
              <>
                <SearchPicker
                  label="Contacto"
                  placeholder="Buscar contacto…"
                  disabled={submitting || !canEdit}
                  value={selectedContact}
                  onChange={(next) => {
                    setSelectedContact(next);
                    setForm((current) => ({
                      ...current,
                      relatedEntityId: next?.id ?? '',
                    }));
                    setErrors((current) => ({ ...current, relatedEntityId: undefined }));
                  }}
                  queryKeyPrefix="calendar-related-contacts"
                  queryFn={searchContacts}
                />
                {renderFieldError('relatedEntityId')}
              </>
            ) : (
              <p className="text-text-muted text-sm">Sin entidad relacionada.</p>
            )}
          </div>
        </div>

        {!canEdit ? <p className="text-text-muted text-sm">Sin permisos para editar.</p> : null}

        <div className="flex items-center justify-between gap-3">
          <div>
            {mode === 'edit' && canEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="border-danger/40 text-danger hover:bg-danger/5 h-10 rounded-md border px-4 text-sm font-medium transition"
              >
                Eliminar
              </button>
            ) : null}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            {canEdit ? (
              <button
                type="submit"
                disabled={submitting}
                className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Guardando…' : mode === 'create' ? 'Crear evento' : 'Guardar cambios'}
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </Modal>
  );
}

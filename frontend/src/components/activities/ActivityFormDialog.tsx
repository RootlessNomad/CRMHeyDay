'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Modal } from '@/components/Modal';
import { createActivity, updateActivity } from '@/lib/api/activities';
import { ApiError } from '@/lib/api/client';
import type {
  ActivityCreateInput,
  ActivityDto,
  ActivityEntityType,
  ActivityKind,
  ActivityUpdateInput,
} from '@/types/activity';

interface ActivityFormDialogProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  activity?: ActivityDto;
  entityType: ActivityEntityType;
  entityId: string;
  onSuccess: (activity: ActivityDto) => void;
}

interface ValidationIssue {
  path?: Array<string | number>;
  message: string;
}

interface ActivityFormState {
  kind: string;
  title: string;
  body: string;
  due_at: string;
  remind_at: string;
}

type ActivityField = 'kind' | 'title' | 'body' | 'due_at' | 'remind_at';
type ActivityFormErrors = Partial<Record<ActivityField, string>>;

const ACTIVITY_KINDS = ['note', 'task', 'call_log', 'email_log', 'meeting_log'] as const;

const ActivitySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS, { message: 'Requerido' }),
  title: z.string().max(200, { message: 'Máximo 200 caracteres' }).nullable(),
  body: z.string().max(10_000, { message: 'Máximo 10000 caracteres' }).nullable(),
  due_at: z.string().datetime({ message: 'Fecha inválida' }).nullable(),
  remind_at: z.string().datetime({ message: 'Fecha inválida' }).nullable(),
});

const KIND_LABELS: Record<ActivityKind, string> = {
  note: 'Nota',
  task: 'Tarea',
  call_log: 'Llamada',
  email_log: 'Email',
  meeting_log: 'Reunión',
};

function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function emptyState(): ActivityFormState {
  return {
    kind: '',
    title: '',
    body: '',
    due_at: '',
    remind_at: '',
  };
}

function stateFromActivity(activity?: ActivityDto): ActivityFormState {
  return {
    kind: activity?.kind ?? '',
    title: activity?.title ?? '',
    body: activity?.body ?? '',
    due_at: activity?.due_at?.slice(0, 16) ?? '',
    remind_at: activity?.remind_at?.slice(0, 16) ?? '',
  };
}

function normalizeNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toIsoOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? new Date(trimmed).toISOString() : null;
}

function toCreatePayload(
  form: ActivityFormState,
  entityType: ActivityEntityType,
  entityId: string,
): ActivityCreateInput {
  return {
    entity_type: entityType,
    entity_id: entityId,
    kind: form.kind as ActivityKind,
    title: normalizeNullable(form.title),
    body: normalizeNullable(form.body),
    due_at: toIsoOrNull(form.due_at),
    remind_at: toIsoOrNull(form.remind_at),
  };
}

function toUpdatePayload(form: ActivityFormState): ActivityUpdateInput {
  return {
    kind: form.kind ? (form.kind as ActivityKind) : undefined,
    title: normalizeNullable(form.title),
    body: normalizeNullable(form.body),
    due_at: toIsoOrNull(form.due_at),
    remind_at: toIsoOrNull(form.remind_at),
  };
}

export function ActivityFormDialog({
  open,
  onClose,
  mode,
  activity,
  entityType,
  entityId,
  onSuccess,
}: ActivityFormDialogProps): JSX.Element | null {
  const [form, setForm] = useState<ActivityFormState>(emptyState());
  const [errors, setErrors] = useState<ActivityFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(mode === 'edit' ? stateFromActivity(activity) : emptyState());
    setErrors({});
    setSubmitting(false);
  }, [activity, mode, open]);

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ): void {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
    setErrors((current) => ({
      ...current,
      [name]: undefined,
    }));
  }

  function renderFieldError(field: ActivityField): JSX.Element | null {
    const message = errors[field];
    if (!message) return null;
    return <p className="text-danger text-xs">{message}</p>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors({});

    const payload =
      mode === 'create' ? toCreatePayload(form, entityType, entityId) : toUpdatePayload(form);
    const parsed = ActivitySchema.safeParse({
      kind: mode === 'create' ? payload.kind : (payload.kind ?? form.kind),
      title: payload.title ?? null,
      body: payload.body ?? null,
      due_at: payload.due_at ?? null,
      remind_at: payload.remind_at ?? null,
    });

    if (!parsed.success) {
      const nextErrors: ActivityFormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          nextErrors[field as ActivityField] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const saved =
        mode === 'create'
          ? await createActivity(payload as ActivityCreateInput)
          : await updateActivity(activity?.id ?? '', payload as ActivityUpdateInput);

      toast.success(mode === 'create' ? 'Actividad creada.' : 'Actividad actualizada.');
      onSuccess(saved);
      onClose();
    } catch (error) {
      if (isApiError(error) && error.status === 400 && error.code === 'VALIDATION_ERROR') {
        const details = Array.isArray(error.details) ? (error.details as ValidationIssue[]) : [];
        const nextErrors: ActivityFormErrors = {};
        for (const issue of details) {
          const field = issue.path?.[0];
          if (typeof field === 'string') {
            nextErrors[field as ActivityField] = issue.message;
          }
        }
        if (Object.keys(nextErrors).length > 0) {
          setErrors(nextErrors);
          return;
        }
      }

      toast.error('No se pudo guardar la actividad.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Nueva actividad' : 'Editar actividad'}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* TODO(roles): añadir owner_id cuando exista selección de usuarios y RBAC. */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="activity-kind" className="block text-sm font-medium">
              Tipo
            </label>
            <select
              id="activity-kind"
              name="kind"
              value={form.kind}
              onChange={handleInputChange}
              disabled={submitting}
              aria-invalid={Boolean(errors.kind)}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            >
              <option value="">Selecciona tipo</option>
              {ACTIVITY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            {renderFieldError('kind')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="activity-title" className="block text-sm font-medium">
              Título
            </label>
            <input
              id="activity-title"
              name="title"
              value={form.title}
              onChange={handleInputChange}
              disabled={submitting}
              maxLength={200}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.title)}
            />
            {renderFieldError('title')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="activity-due_at" className="block text-sm font-medium">
              Vence
            </label>
            <input
              id="activity-due_at"
              name="due_at"
              type="datetime-local"
              value={form.due_at}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.due_at)}
            />
            {renderFieldError('due_at')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="activity-remind_at" className="block text-sm font-medium">
              Recordatorio
            </label>
            <input
              id="activity-remind_at"
              name="remind_at"
              type="datetime-local"
              value={form.remind_at}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.remind_at)}
            />
            {renderFieldError('remind_at')}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="activity-body" className="block text-sm font-medium">
            Contenido
          </label>
          <textarea
            id="activity-body"
            name="body"
            value={form.body}
            onChange={handleInputChange}
            disabled={submitting}
            maxLength={10_000}
            rows={6}
            className="border-border bg-bg focus:border-accent min-h-32 w-full rounded-sm border px-3 py-2 text-sm outline-none transition"
            aria-invalid={Boolean(errors.body)}
          />
          {renderFieldError('body')}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-accent text-bg h-10 rounded-md px-4 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? mode === 'create'
                ? 'Creando…'
                : 'Guardando…'
              : mode === 'create'
                ? 'Crear actividad'
                : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

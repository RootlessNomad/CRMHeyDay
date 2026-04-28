'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Modal } from '@/components/Modal';
import { TagPicker } from '@/components/tags/TagPicker';
import { useAuthStore } from '@/lib/auth/store';
import { createLead, updateLead } from '@/lib/api/leads';
import { listPipelines } from '@/lib/api/pipelines';
import type { LeadCreateInput, LeadDto, LeadUpdateInput } from '@/types/lead';
import type { PipelineDto, PipelineStageDto } from '@/types/pipeline';

import { CompanyPicker } from '../contacts/CompanyPicker';

import { ContactPicker } from './ContactPicker';

interface LeadFormDialogProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  lead?: LeadDto;
  onSuccess: (l: LeadDto) => void;
}

interface CompanySelection {
  id: string;
  name: string;
}

interface LeadFormState {
  pipelineId: string;
  stageId: string;
  company: CompanySelection | null;
  primaryContactId: string;
  priorityManual: string;
  nextActionAt: string;
  ownerId: string;
}

type LeadField =
  | 'pipelineId'
  | 'stageId'
  | 'companyId'
  | 'primaryContactId'
  | 'priorityManual'
  | 'nextActionAt'
  | 'ownerId';
type LeadFormErrors = Partial<Record<LeadField, string>>;

const LeadSchema = z.object({
  pipelineId: z.string().min(1, { message: 'Requerido' }),
  stageId: z.string().min(1, { message: 'Requerido' }),
  companyId: z.string().min(1, { message: 'Requerido' }),
  primaryContactId: z.string().min(1).optional(),
  priorityManual: z.number().int().min(0).max(100).optional(),
  nextActionAt: z.string().datetime().optional(),
  ownerId: z.string().min(1, { message: 'Requerido' }),
});

function emptyState(ownerId: string): LeadFormState {
  return {
    pipelineId: '',
    stageId: '',
    company: null,
    primaryContactId: '',
    priorityManual: '',
    nextActionAt: '',
    ownerId,
  };
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function getSortedStages(pipeline?: PipelineDto): PipelineStageDto[] {
  return [...(pipeline?.stages ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
}

function getFirstOpenStageId(pipeline?: PipelineDto): string {
  const openStage = getSortedStages(pipeline).find((stage) => stage.kind === 'open');
  return openStage?.id ?? '';
}

function stateFromLead(lead: LeadDto | undefined, ownerId: string): LeadFormState {
  return {
    pipelineId: lead?.pipelineId ?? '',
    stageId: lead?.stageId ?? '',
    company: lead
      ? {
          id: lead.companyId,
          name: lead.company?.name ?? lead.companyId,
        }
      : null,
    primaryContactId: lead?.primaryContactId ?? '',
    priorityManual:
      lead?.priorityManual === null || lead?.priorityManual === undefined
        ? ''
        : String(lead.priorityManual),
    nextActionAt: toDateTimeLocalValue(lead?.nextActionAt ?? null),
    ownerId: lead?.ownerId ?? ownerId,
  };
}

function sanitizeString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toPayload(
  form: LeadFormState,
  mode: 'create' | 'edit',
): LeadCreateInput | LeadUpdateInput {
  const nextActionAt = sanitizeString(form.nextActionAt);
  const priorityManual = sanitizeString(form.priorityManual);
  const payload = {
    companyId: form.company?.id ?? '',
    pipelineId: form.pipelineId,
    stageId: form.stageId,
    ownerId: form.ownerId,
    primaryContactId: sanitizeString(form.primaryContactId),
    priorityManual: priorityManual === undefined ? undefined : Number(priorityManual),
    nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : undefined,
  };

  if (mode === 'create') {
    return {
      ...payload,
      source: 'manual',
    };
  }

  return payload;
}

export function LeadFormDialog({
  open,
  onClose,
  mode,
  lead,
  onSuccess,
}: LeadFormDialogProps): JSX.Element | null {
  const currentUserId = useAuthStore((s) => s.user?.id ?? '');
  const [form, setForm] = useState<LeadFormState>(() => emptyState(currentUserId));
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const pipelinesQuery = useQuery({
    queryKey: ['pipelines'],
    queryFn: listPipelines,
    enabled: open,
  });

  const pipelines = pipelinesQuery.data ?? [];
  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === form.pipelineId);
  const stageOptions = getSortedStages(selectedPipeline);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open || pipelines.length === 0) return;

    if (mode === 'edit' && lead) {
      setForm(stateFromLead(lead, currentUserId));
      return;
    }

    setForm((current) => {
      if (current.pipelineId) return current;

      const initialPipeline =
        pipelines.find((pipeline) => pipeline.isDefault) ??
        [...pipelines].sort((a, b) => a.name.localeCompare(b.name))[0];

      if (!initialPipeline) return current;

      return {
        ...emptyState(currentUserId),
        pipelineId: initialPipeline.id,
        stageId: getFirstOpenStageId(initialPipeline),
      };
    });
  }, [currentUserId, lead, mode, open, pipelines]);

  function handlePipelineChange(pipelineId: string): void {
    const nextPipeline = pipelines.find((pipeline) => pipeline.id === pipelineId);
    setForm((current) => ({
      ...current,
      pipelineId,
      stageId: getFirstOpenStageId(nextPipeline),
    }));
    setErrors((current) => ({
      ...current,
      pipelineId: undefined,
      stageId: undefined,
    }));
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const { name, value } = event.target;

    if (name === 'pipelineId') {
      handlePipelineChange(value);
      return;
    }

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
    setErrors((current) => ({
      ...current,
      [name]: undefined,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors({});

    const payload = toPayload(form, mode);
    const parsed = LeadSchema.safeParse({
      companyId: payload.companyId,
      pipelineId: payload.pipelineId,
      stageId: payload.stageId,
      primaryContactId: payload.primaryContactId,
      priorityManual: payload.priorityManual,
      nextActionAt: payload.nextActionAt,
      ownerId: payload.ownerId,
    });

    if (!parsed.success) {
      const nextErrors: LeadFormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          nextErrors[field as LeadField] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const saved =
        mode === 'create'
          ? await createLead(payload as LeadCreateInput)
          : await updateLead(lead?.id ?? '', payload as LeadUpdateInput);

      toast.success(mode === 'create' ? 'Lead creado.' : 'Lead actualizado.');
      onSuccess(saved);
      onClose();
    } catch {
      toast.error('No se pudo guardar el lead.');
    } finally {
      setSubmitting(false);
    }
  }

  function renderFieldError(field: LeadField): JSX.Element | null {
    const message = errors[field];
    if (!message) return null;
    return <p className="text-danger text-xs">{message}</p>;
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === 'create' ? 'Nuevo lead' : 'Editar lead'}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <input type="hidden" name="ownerId" value={form.ownerId} readOnly />
        {/* TODO(roles): cuando UJ-11 (gestión de usuarios) aterrice, añadir UserPicker. */}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="lead-pipeline" className="block text-sm font-medium">
              Pipeline
            </label>
            <select
              id="lead-pipeline"
              name="pipelineId"
              value={form.pipelineId}
              onChange={handleInputChange}
              disabled={submitting || pipelinesQuery.isLoading || pipelines.length === 0}
              aria-invalid={Boolean(errors.pipelineId)}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            >
              <option value="">Selecciona pipeline</option>
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
            {renderFieldError('pipelineId')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lead-stage" className="block text-sm font-medium">
              Stage
            </label>
            <select
              id="lead-stage"
              name="stageId"
              value={form.stageId}
              onChange={handleInputChange}
              disabled={submitting || !form.pipelineId}
              aria-invalid={Boolean(errors.stageId)}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            >
              <option value="">Selecciona stage</option>
              {stageOptions.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
            {renderFieldError('stageId')}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="lead-company" className="block text-sm font-medium">
            Empresa
          </label>
          <CompanyPicker
            inputId="lead-company"
            value={form.company}
            onChange={(next) => {
              setForm((current) => ({
                ...current,
                company: next,
                primaryContactId: '',
              }));
              setErrors((current) => ({
                ...current,
                companyId: undefined,
                primaryContactId: undefined,
              }));
            }}
            disabled={submitting}
            error={errors.companyId}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="lead-contact" className="block text-sm font-medium">
            Contacto
          </label>
          <ContactPicker
            inputId="lead-contact"
            companyId={form.company?.id ?? null}
            value={form.primaryContactId}
            onChange={(id) => {
              setForm((current) => ({
                ...current,
                primaryContactId: id,
              }));
              setErrors((current) => ({
                ...current,
                primaryContactId: undefined,
              }));
            }}
            disabled={submitting}
            error={errors.primaryContactId}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="lead-priorityManual" className="block text-sm font-medium">
              Prioridad manual
            </label>
            <input
              id="lead-priorityManual"
              name="priorityManual"
              type="number"
              min={0}
              max={100}
              value={form.priorityManual}
              onChange={handleInputChange}
              disabled={submitting}
              aria-invalid={Boolean(errors.priorityManual)}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderFieldError('priorityManual')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lead-nextActionAt" className="block text-sm font-medium">
              Próxima acción
            </label>
            <input
              id="lead-nextActionAt"
              name="nextActionAt"
              type="datetime-local"
              value={form.nextActionAt}
              onChange={handleInputChange}
              disabled={submitting}
              aria-invalid={Boolean(errors.nextActionAt)}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderFieldError('nextActionAt')}
          </div>
        </div>

        {pipelinesQuery.isError ? (
          <p className="text-danger text-sm">No se pudieron cargar los pipelines.</p>
        ) : null}

        <div className="border-border bg-surface space-y-3 rounded-lg border px-4 py-4">
          <h3 className="text-sm font-medium">Tags</h3>
          <TagPicker entityType="lead" entityId={mode === 'edit' ? (lead?.id ?? null) : null} />
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
            disabled={submitting || pipelinesQuery.isLoading}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : mode === 'create' ? 'Crear lead' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

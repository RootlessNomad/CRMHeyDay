'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { getCompany } from '@/lib/api/companies';
import {
  createOutreachTask,
  getOutboundPrep,
  regenerateOutboundPrep,
  type OutboundPrepDto,
  updateOutboundPrep,
} from '@/lib/api/intel';

// Defensa contra `javascript:` u otros schemes peligrosos: sólo http(s) navegable.
function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    return null;
  } catch {
    return null;
  }
}

type EditableOutboundField = keyof Pick<
  OutboundPrepDto,
  | 'segment'
  | 'likely_need'
  | 'outreach_angle'
  | 'value_proposition'
  | 'service_pitch'
  | 'tone_guidance'
  | 'sdr_notes'
>;

type UpdateOutboundPrepInput = Partial<
  Omit<
    OutboundPrepDto,
    'id' | 'company_id' | 'created_at' | 'updated_at' | 'last_generated_at' | 'last_generated_by_id'
  >
>;

const BRIEFING_FIELDS: Array<{ key: Exclude<EditableOutboundField, 'sdr_notes'>; label: string }> =
  [
    { key: 'segment', label: 'Segmento' },
    { key: 'likely_need', label: 'Necesidad probable' },
    { key: 'outreach_angle', label: 'Ángulo de outreach' },
    { key: 'value_proposition', label: 'Value proposition' },
    { key: 'service_pitch', label: 'Pitch de servicio' },
    { key: 'tone_guidance', label: 'Guía de tono' },
  ];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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
  return formatter.format(Math.round(diffMonths / 12), 'year');
}

function getPriorityMeta(score: number): { label: string; className: string } {
  if (score <= 39) return { label: 'Prioridad baja', className: 'bg-slate-100 text-slate-700' };
  if (score <= 69) return { label: 'Prioridad media', className: 'bg-amber-100 text-amber-800' };
  return { label: 'Prioridad alta', className: 'bg-emerald-100 text-emerald-800' };
}

function formatBriefing(data: OutboundPrepDto): string {
  return [
    `Segmento: ${data.segment}`,
    `Necesidad probable: ${data.likely_need}`,
    `Ángulo de outreach: ${data.outreach_angle}`,
    `Value proposition: ${data.value_proposition}`,
    `Pitch de servicio: ${data.service_pitch}`,
    `Guía de tono: ${data.tone_guidance}`,
    `Prioridad: ${data.priority_score}/100`,
    `Notas del SDR: ${data.sdr_notes ?? '—'}`,
  ].join('\n');
}

function OutboundPrepSkeleton(): JSX.Element {
  return (
    <div
      data-testid="outbound-prep-skeleton"
      className="border-border bg-surface space-y-4 rounded-2xl border p-5 shadow-sm"
    >
      <div className="bg-surface-muted h-7 w-56 animate-pulse rounded-md" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="bg-surface-muted h-4 w-28 animate-pulse rounded-md" />
            <div className="bg-surface-muted h-24 animate-pulse rounded-xl" />
          </div>
        ))}
      </div>
      <div className="bg-surface-muted h-28 animate-pulse rounded-xl" />
    </div>
  );
}

function EditableTextarea({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}): JSX.Element {
  return (
    <label className="space-y-2">
      <span className="text-text-muted text-xs uppercase tracking-[0.14em]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        rows={4}
        className="border-border bg-bg min-h-28 w-full rounded-xl border px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--color-accent)]"
      />
    </label>
  );
}

export function OutboundPrepCard({ companyId }: { companyId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const normalizedCompanyId = companyId.trim();
  const [draft, setDraft] = useState<UpdateOutboundPrepInput | null>(null);

  const outboundPrepQuery = useQuery({
    queryKey: ['intel', 'outbound-prep', normalizedCompanyId],
    queryFn: () => getOutboundPrep(normalizedCompanyId),
    enabled: normalizedCompanyId.length > 0,
  });

  // El demo_link vive en Company; reutiliza la query cacheada por la ficha de empresa.
  const companyQuery = useQuery({
    queryKey: ['companies', normalizedCompanyId],
    queryFn: () => getCompany(normalizedCompanyId),
    enabled: normalizedCompanyId.length > 0,
  });
  const demoLink = companyQuery.data?.demo_link ? safeHttpUrl(companyQuery.data.demo_link) : null;

  async function handleCopyDemoLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Demo copiado');
    } catch {
      toast.error('No se pudo copiar el enlace.');
    }
  }

  async function handleCopyEmail(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Email copiado');
    } catch {
      toast.error('No se pudo copiar el email.');
    }
  }

  useEffect(() => {
    if (!outboundPrepQuery.data) {
      setDraft(null);
      return;
    }

    setDraft({
      segment: outboundPrepQuery.data.segment,
      likely_need: outboundPrepQuery.data.likely_need,
      outreach_angle: outboundPrepQuery.data.outreach_angle,
      value_proposition: outboundPrepQuery.data.value_proposition,
      service_pitch: outboundPrepQuery.data.service_pitch,
      tone_guidance: outboundPrepQuery.data.tone_guidance,
      priority_score: outboundPrepQuery.data.priority_score,
      sdr_notes: outboundPrepQuery.data.sdr_notes,
    });
  }, [outboundPrepQuery.data]);

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateOutboundPrep(normalizedCompanyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['intel', 'outbound-prep', normalizedCompanyId],
      });
      toast.success('Briefing regenerado');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo regenerar el briefing.'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateOutboundPrepInput) => updateOutboundPrep(normalizedCompanyId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['intel', 'outbound-prep', normalizedCompanyId],
      });
      toast.success('Guardado');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo guardar el briefing.'));
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: () => createOutreachTask(normalizedCompanyId),
    onSuccess: (result) => {
      toast.success(
        `Tarea creada — vence el ${new Date(result.due_at).toLocaleDateString('es-ES')}`,
      );
    },
    onError: () => {
      toast.error('No se pudo crear la tarea de outreach.');
    },
  });

  function updateDraftField(
    field: keyof UpdateOutboundPrepInput,
    value: string | number | null,
  ): void {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function handleFieldBlur(field: keyof UpdateOutboundPrepInput): void {
    const current = draft;
    const original = outboundPrepQuery.data;
    if (!current || !original) return;

    const nextValue = current[field];
    const previousValue = original[field];
    if (nextValue === previousValue) return;

    updateMutation.mutate({ [field]: nextValue } as UpdateOutboundPrepInput);
  }

  async function handleCopy(data: OutboundPrepDto): Promise<void> {
    try {
      await navigator.clipboard.writeText(formatBriefing(data));
      toast.success('Copiado');
    } catch {
      toast.error('No se pudo copiar al portapapeles.');
    }
  }

  if (outboundPrepQuery.isLoading) {
    return <OutboundPrepSkeleton />;
  }

  if (outboundPrepQuery.isError) {
    return (
      <div className="border-border bg-surface rounded-2xl border p-8 text-center shadow-sm">
        <p className="text-sm text-red-600">
          {getErrorMessage(outboundPrepQuery.error, 'No se pudo cargar el briefing.')}
        </p>
      </div>
    );
  }

  if (!outboundPrepQuery.data) {
    return (
      <section className="border-border bg-surface rounded-2xl border p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight">Outbound Prep</h2>
        <p className="text-text-muted mt-2 text-sm">
          Todavía no hay briefing de outreach para esta empresa.
        </p>
        <button
          type="button"
          onClick={() => regenerateMutation.mutate()}
          disabled={regenerateMutation.isPending}
          className="bg-accent mt-4 rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {regenerateMutation.isPending ? 'Generando…' : 'Generar briefing de outreach'}
        </button>
      </section>
    );
  }

  const prep = outboundPrepQuery.data;
  const priority = getPriorityMeta(prep.priority_score);

  return (
    <section className="space-y-4">
      <div className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">Outbound Prep</h2>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${priority.className}`}
              >
                {priority.label} · {prep.priority_score}/100
              </span>
            </div>
            <p className="text-text-muted text-sm">
              Última generación {formatRelativeDate(prep.last_generated_at)}.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCopy(prep)}
              className="border-border bg-surface-muted hover:bg-bg rounded-md border px-4 py-2 text-sm font-medium transition"
            >
              Copiar todo al portapapeles
            </button>
            <button
              type="button"
              onClick={() => createTaskMutation.mutate()}
              disabled={createTaskMutation.isPending}
              className="border-border bg-surface-muted hover:bg-bg rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createTaskMutation.isPending ? 'Creando tarea…' : 'Crear tarea de outreach'}
            </button>
            <button
              type="button"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              className="border-border bg-surface-muted hover:bg-bg rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {regenerateMutation.isPending ? 'Regenerando…' : 'Regenerar con IA'}
            </button>
          </div>
        </div>
        {demoLink ? (
          <div className="border-border mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
            <span className="text-text-muted text-xs uppercase tracking-[0.14em]">Demo</span>
            <a
              href={demoLink}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm underline underline-offset-4"
            >
              {demoLink}
            </a>
            <button
              type="button"
              onClick={() => void handleCopyDemoLink(demoLink)}
              className="border-border bg-surface-muted hover:bg-bg rounded-md border px-3 py-1.5 text-xs font-medium transition"
            >
              Copiar
            </button>
          </div>
        ) : null}
      </div>

      <div className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Briefing</h3>
          <p className="text-text-muted mt-1 text-sm">
            Ajusta cada campo inline. Solo se envían los cambios al perder foco.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {BRIEFING_FIELDS.map((field) => (
            <EditableTextarea
              key={field.key}
              label={field.label}
              value={(draft?.[field.key] as string | undefined) ?? ''}
              onChange={(value) => updateDraftField(field.key, value)}
              onBlur={() => handleFieldBlur(field.key)}
            />
          ))}
        </div>
      </div>

      {prep.email_draft ? (
        <div className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Email en frío</h3>
            <button
              type="button"
              onClick={() => void handleCopyEmail(prep.email_draft!)}
              className="border-border bg-surface-muted hover:bg-bg rounded-md border px-3 py-1.5 text-xs font-medium transition"
            >
              Copiar email
            </button>
          </div>
          <textarea
            readOnly
            value={prep.email_draft}
            rows={10}
            className="border-border bg-bg min-h-40 w-full rounded-xl border px-3 py-2 text-sm leading-6 outline-none"
          />
        </div>
      ) : null}

      <div className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
        <div className="mb-3">
          <h3 className="text-lg font-semibold">Notas del SDR</h3>
        </div>
        <EditableTextarea
          label="Notas internas"
          value={draft?.sdr_notes ?? ''}
          onChange={(value) => updateDraftField('sdr_notes', value)}
          onBlur={() => handleFieldBlur('sdr_notes')}
        />
      </div>
    </section>
  );
}

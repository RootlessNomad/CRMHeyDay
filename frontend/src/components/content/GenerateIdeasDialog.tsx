'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { VERTICAL_LABELS, generateIdeas, getPillars, isContentDailyLimit } from '@/lib/api/content';

interface GenerateIdeasDialogProps {
  open: boolean;
  onClose: () => void;
  onJobCreated: (jobId: string) => void;
}

interface GenerateIdeasFormState {
  pillar_id: string;
  icp_vertical: string;
  brief_es: string;
  count: string;
}

interface GenerateIdeasFormErrors {
  pillar_id?: string;
  icp_vertical?: string;
  brief_es?: string;
  count?: string;
}

function emptyState(): GenerateIdeasFormState {
  return {
    pillar_id: '',
    icp_vertical: '',
    brief_es: '',
    count: '5',
  };
}

function validateForm(form: GenerateIdeasFormState): GenerateIdeasFormErrors {
  const errors: GenerateIdeasFormErrors = {};
  const brief = form.brief_es.trim();
  const count = Number(form.count);

  if (!form.pillar_id) errors.pillar_id = 'Selecciona un pilar.';
  if (brief.length < 1) errors.brief_es = 'El brief es obligatorio.';
  if (brief.length > 2000) errors.brief_es = 'Máximo 2000 caracteres.';
  if (!Number.isInteger(count) || count < 3 || count > 10) {
    errors.count = 'El número de ideas debe estar entre 3 y 10.';
  }

  return errors;
}

export function GenerateIdeasDialog({
  open,
  onClose,
  onJobCreated,
}: GenerateIdeasDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const pillarsQuery = useQuery({
    queryKey: ['content', 'pillars'],
    queryFn: getPillars,
    enabled: open,
  });
  const [form, setForm] = useState<GenerateIdeasFormState>(emptyState());
  const [errors, setErrors] = useState<GenerateIdeasFormErrors>({});

  useEffect(() => {
    if (!open) return;
    setForm(emptyState());
    setErrors({});
  }, [open]);

  const mutation = useMutation({
    mutationFn: generateIdeas,
    onSuccess: async (response) => {
      onJobCreated(response.job_id);
      await queryClient.invalidateQueries({ queryKey: ['content', 'ideas'] });
      onClose();
    },
    onError: (error) => {
      if (isContentDailyLimit(error)) {
        toast.error('Has alcanzado el límite diario de generaciones. Inténtalo mañana.');
        return;
      }

      toast.error(error instanceof Error ? error.message : 'No se pudieron generar ideas.');
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await mutation.mutateAsync({
        generate: true,
        pillar_id: form.pillar_id,
        brief_es: form.brief_es.trim(),
        icp_vertical: form.icp_vertical || undefined,
        count: Number(form.count),
      });
    } catch {
      // El error se maneja en onError para evitar rechazos no capturados.
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Generar ideas con IA">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="space-y-1">
          <span className="text-sm font-medium">Pilar</span>
          <select
            value={form.pillar_id}
            onChange={(event) => {
              setForm((current) => ({ ...current, pillar_id: event.target.value }));
              setErrors((current) => ({ ...current, pillar_id: undefined }));
            }}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
            aria-invalid={errors.pillar_id ? 'true' : 'false'}
            aria-describedby={errors.pillar_id ? 'generate-pillar-error' : undefined}
          >
            <option value="">Selecciona un pilar</option>
            {(pillarsQuery.data ?? []).map((pillar) => (
              <option key={pillar.id} value={pillar.id}>
                {pillar.label_es}
              </option>
            ))}
          </select>
          {errors.pillar_id ? (
            <p id="generate-pillar-error" className="text-sm text-red-600">
              {errors.pillar_id}
            </p>
          ) : null}
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Vertical</span>
          <select
            value={form.icp_vertical}
            onChange={(event) =>
              setForm((current) => ({ ...current, icp_vertical: event.target.value }))
            }
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
          >
            <option value="">Sin preferencia</option>
            {Object.entries(VERTICAL_LABELS).map(([vertical, label]) => (
              <option key={vertical} value={vertical}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Brief</span>
          <textarea
            value={form.brief_es}
            onChange={(event) => {
              setForm((current) => ({ ...current, brief_es: event.target.value }));
              setErrors((current) => ({ ...current, brief_es: undefined }));
            }}
            rows={6}
            className="border-border bg-bg focus:border-accent min-h-32 w-full rounded-xl border px-4 py-3 text-sm outline-none transition"
            aria-invalid={errors.brief_es ? 'true' : 'false'}
            aria-describedby={errors.brief_es ? 'generate-brief-error' : undefined}
          />
          <p className="text-text-muted text-xs">{form.brief_es.length}/2000</p>
          {errors.brief_es ? (
            <p id="generate-brief-error" className="text-sm text-red-600">
              {errors.brief_es}
            </p>
          ) : null}
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Número de ideas</span>
          <input
            type="number"
            min={3}
            max={10}
            value={form.count}
            onChange={(event) => {
              setForm((current) => ({ ...current, count: event.target.value }));
              setErrors((current) => ({ ...current, count: undefined }));
            }}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
            aria-invalid={errors.count ? 'true' : 'false'}
            aria-describedby={errors.count ? 'generate-count-error' : undefined}
          />
          {errors.count ? (
            <p id="generate-count-error" className="text-sm text-red-600">
              {errors.count}
            </p>
          ) : null}
        </label>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? 'Generando...' : 'Generar ideas'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

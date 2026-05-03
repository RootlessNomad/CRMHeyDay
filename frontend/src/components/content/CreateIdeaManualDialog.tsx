'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { VERTICAL_LABELS, createIdeaManual, getPillars } from '@/lib/api/content';

interface CreateIdeaManualDialogProps {
  open: boolean;
  onClose: () => void;
}

interface CreateIdeaFormState {
  title: string;
  angle: string;
  pillar_id: string;
  icp_vertical: string;
  brief_es: string;
}

type CreateIdeaFormErrors = Partial<Record<keyof CreateIdeaFormState, string>>;

function emptyState(): CreateIdeaFormState {
  return {
    title: '',
    angle: '',
    pillar_id: '',
    icp_vertical: '',
    brief_es: '',
  };
}

function validateForm(form: CreateIdeaFormState): CreateIdeaFormErrors {
  const errors: CreateIdeaFormErrors = {};

  if (!form.title.trim()) errors.title = 'El título es obligatorio.';
  if (!form.angle.trim()) errors.angle = 'El ángulo es obligatorio.';
  if (!form.pillar_id) errors.pillar_id = 'Selecciona un pilar.';
  if (form.brief_es.trim().length < 1) errors.brief_es = 'El brief es obligatorio.';
  if (form.brief_es.trim().length > 2000) errors.brief_es = 'Máximo 2000 caracteres.';

  return errors;
}

export function CreateIdeaManualDialog({
  open,
  onClose,
}: CreateIdeaManualDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const pillarsQuery = useQuery({
    queryKey: ['content', 'pillars'],
    queryFn: getPillars,
    enabled: open,
  });
  const [form, setForm] = useState<CreateIdeaFormState>(emptyState());
  const [errors, setErrors] = useState<CreateIdeaFormErrors>({});

  useEffect(() => {
    if (!open) return;
    setForm(emptyState());
    setErrors({});
  }, [open]);

  const mutation = useMutation({
    mutationFn: createIdeaManual,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['content', 'ideas'] });
      toast.success('Idea creada');
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear la idea.');
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await mutation.mutateAsync({
        title: form.title.trim(),
        angle: form.angle.trim(),
        pillar_id: form.pillar_id,
        brief_es: form.brief_es.trim(),
        icp_vertical: form.icp_vertical || undefined,
      });
    } catch {
      // El error se maneja en onError para evitar rechazos no capturados.
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Crear idea manual">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="space-y-1">
          <span className="text-sm font-medium">Título</span>
          <input
            value={form.title}
            onChange={(event) => {
              setForm((current) => ({ ...current, title: event.target.value }));
              setErrors((current) => ({ ...current, title: undefined }));
            }}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
            aria-invalid={errors.title ? 'true' : 'false'}
          />
          {errors.title ? <p className="text-sm text-red-600">{errors.title}</p> : null}
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Ángulo</span>
          <input
            value={form.angle}
            onChange={(event) => {
              setForm((current) => ({ ...current, angle: event.target.value }));
              setErrors((current) => ({ ...current, angle: undefined }));
            }}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
            aria-invalid={errors.angle ? 'true' : 'false'}
          />
          {errors.angle ? <p className="text-sm text-red-600">{errors.angle}</p> : null}
        </label>

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
          >
            <option value="">Selecciona un pilar</option>
            {(pillarsQuery.data ?? []).map((pillar) => (
              <option key={pillar.id} value={pillar.id}>
                {pillar.label_es}
              </option>
            ))}
          </select>
          {errors.pillar_id ? <p className="text-sm text-red-600">{errors.pillar_id}</p> : null}
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
            <option value="">Sin vertical</option>
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
          />
          <p className="text-text-muted text-xs">{form.brief_es.length}/2000</p>
          {errors.brief_es ? <p className="text-sm text-red-600">{errors.brief_es}</p> : null}
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
            {mutation.isPending ? 'Creando...' : 'Crear idea'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

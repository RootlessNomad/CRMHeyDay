'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { IDEA_STATUS_LABELS, updateIdea, type IdeaDto } from '@/lib/api/content';

interface EditIdeaDialogProps {
  idea: IdeaDto;
  open: boolean;
  onClose: () => void;
}

interface EditIdeaFormState {
  title: string;
  angle: string;
  brief_es: string;
  status: string;
}

type EditIdeaFormErrors = Partial<Record<keyof EditIdeaFormState, string>>;

function stateFromIdea(idea: IdeaDto): EditIdeaFormState {
  return {
    title: idea.title,
    angle: idea.angle,
    brief_es: idea.brief_es,
    status: idea.status,
  };
}

function validateForm(form: EditIdeaFormState): EditIdeaFormErrors {
  const errors: EditIdeaFormErrors = {};

  if (!form.title.trim()) errors.title = 'El título es obligatorio.';
  if (!form.angle.trim()) errors.angle = 'El ángulo es obligatorio.';
  if (form.brief_es.trim().length < 1) errors.brief_es = 'El brief es obligatorio.';
  if (form.brief_es.trim().length > 2000) errors.brief_es = 'Máximo 2000 caracteres.';
  if (!form.status) errors.status = 'Selecciona un estado.';

  return errors;
}

export function EditIdeaDialog({ idea, open, onClose }: EditIdeaDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditIdeaFormState>(stateFromIdea(idea));
  const [errors, setErrors] = useState<EditIdeaFormErrors>({});

  useEffect(() => {
    if (!open) return;
    setForm(stateFromIdea(idea));
    setErrors({});
  }, [idea, open]);

  const mutation = useMutation({
    mutationFn: (input: EditIdeaFormState) =>
      updateIdea(idea.id, {
        title: input.title.trim(),
        angle: input.angle.trim(),
        brief_es: input.brief_es.trim(),
        status: input.status,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['content', 'ideas'] });
      toast.success('Idea actualizada');
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la idea.');
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await mutation.mutateAsync(form);
    } catch {
      // El error se maneja en onError para evitar rechazos no capturados.
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Editar idea">
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
          />
          {errors.angle ? <p className="text-sm text-red-600">{errors.angle}</p> : null}
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
          />
          <p className="text-text-muted text-xs">{form.brief_es.length}/2000</p>
          {errors.brief_es ? <p className="text-sm text-red-600">{errors.brief_es}</p> : null}
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Estado</span>
          <select
            value={form.status}
            onChange={(event) => {
              setForm((current) => ({ ...current, status: event.target.value }));
              setErrors((current) => ({ ...current, status: undefined }));
            }}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
          >
            {Object.entries(IDEA_STATUS_LABELS).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
          {errors.status ? <p className="text-sm text-red-600">{errors.status}</p> : null}
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
            {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

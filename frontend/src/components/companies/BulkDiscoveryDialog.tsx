'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { bulkDiscoverySearch } from '@/lib/api/discovery';

interface BulkDiscoveryDialogProps {
  open: boolean;
  onClose: () => void;
  onJobCreated: (jobId: string) => void;
}

interface FormState {
  city: string;
  businessType: string;
  triggerEnrichment: boolean;
}

interface FormErrors {
  city?: string;
  businessType?: string;
}

function emptyState(): FormState {
  return { city: '', businessType: 'gimnasio', triggerEnrichment: true };
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.city.trim()) errors.city = 'La ciudad es obligatoria.';
  if (!form.businessType.trim()) errors.businessType = 'El tipo de negocio es obligatorio.';
  return errors;
}

export function BulkDiscoveryDialog({
  open,
  onClose,
  onJobCreated,
}: BulkDiscoveryDialogProps): JSX.Element | null {
  const [form, setForm] = useState<FormState>(emptyState());
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!open) return;
    setForm(emptyState());
    setErrors({});
  }, [open]);

  const mutation = useMutation({
    mutationFn: bulkDiscoverySearch,
    onSuccess: (response) => {
      onJobCreated(response.jobId);
      toast.success('Descubrimiento lanzado. Buscando negocios…');
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo lanzar el descubrimiento.');
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await mutation.mutateAsync({
        city: form.city.trim(),
        businessType: form.businessType.trim(),
        triggerEnrichment: form.triggerEnrichment,
      });
    } catch {
      // onError gestiona el feedback.
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Descubrir negocios">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-text-muted text-sm">
          Busca negocios en Google Places por ciudad y tipo, y crea una empresa por cada uno (sin
          duplicar las que ya tienes).
        </p>

        <label className="space-y-1">
          <span className="text-sm font-medium">Ciudad</span>
          <input
            value={form.city}
            onChange={(event) => {
              setForm((current) => ({ ...current, city: event.target.value }));
              setErrors((current) => ({ ...current, city: undefined }));
            }}
            placeholder="Madrid, Barcelona…"
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
            aria-invalid={errors.city ? 'true' : 'false'}
          />
          {errors.city ? <p className="text-sm text-red-600">{errors.city}</p> : null}
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium">Tipo de negocio</span>
          <input
            value={form.businessType}
            onChange={(event) => {
              setForm((current) => ({ ...current, businessType: event.target.value }));
              setErrors((current) => ({ ...current, businessType: undefined }));
            }}
            placeholder="gimnasio, clínica de fisioterapia…"
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-md border px-3 text-sm outline-none transition"
            aria-invalid={errors.businessType ? 'true' : 'false'}
          />
          {errors.businessType ? (
            <p className="text-sm text-red-600">{errors.businessType}</p>
          ) : null}
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.triggerEnrichment}
            onChange={(event) =>
              setForm((current) => ({ ...current, triggerEnrichment: event.target.checked }))
            }
            className="border-border h-4 w-4 rounded"
          />
          <span>Enriquecer automáticamente las que tengan web</span>
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
            {mutation.isPending ? 'Lanzando…' : 'Descubrir'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

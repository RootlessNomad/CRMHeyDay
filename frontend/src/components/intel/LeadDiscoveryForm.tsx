'use client';

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { startLeadDiscovery } from '@/lib/api/lead-discovery';

interface LeadDiscoveryFormProps {
  onJobCreated: (jobId: string) => void;
}

interface FormState {
  city: string;
  businessType: string;
}

interface FormErrors {
  city?: string;
  businessType?: string;
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.city.trim()) errors.city = 'La ciudad es obligatoria.';
  if (!form.businessType.trim()) errors.businessType = 'El tipo de negocio es obligatorio.';
  return errors;
}

export function LeadDiscoveryForm({ onJobCreated }: LeadDiscoveryFormProps): JSX.Element {
  const [form, setForm] = useState<FormState>({ city: '', businessType: '' });
  const [errors, setErrors] = useState<FormErrors>({});

  const mutation = useMutation({
    mutationFn: startLeadDiscovery,
    onSuccess: (response) => {
      onJobCreated(response.jobId);
      toast.success('Búsqueda iniciada. Encontrando leads…');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo buscar leads.');
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
      });
    } catch {
      // onError gestiona el feedback.
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border/70 bg-surface/85 supports-[backdrop-filter]:bg-surface/75 space-y-4 rounded-2xl border p-5 shadow-sm backdrop-blur"
    >
      <p className="text-text-muted text-sm">
        Busca leads cualificados por ciudad y tipo de negocio sin salir de Investigar.
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
        {errors.businessType ? <p className="text-sm text-red-600">{errors.businessType}</p> : null}
      </label>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? 'Buscando…' : 'Buscar leads'}
        </button>
      </div>
    </form>
  );
}

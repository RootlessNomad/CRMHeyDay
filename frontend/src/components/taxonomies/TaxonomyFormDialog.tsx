'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Modal } from '@/components/Modal';
import { ApiError } from '@/lib/api/client';

interface TaxonomyFormValues {
  labelEs: string;
  descriptionEs: string;
}

type TaxonomyFormErrors = Partial<Record<keyof TaxonomyFormValues | 'form', string>>;

const TaxonomySchema = z.object({
  labelEs: z
    .string()
    .trim()
    .min(1, { message: 'Requerido' })
    .max(200, { message: 'Máximo 200 caracteres' }),
  descriptionEs: z
    .string()
    .trim()
    .min(1, { message: 'Requerido' })
    .max(500, { message: 'Máximo 500 caracteres' }),
});

export interface TaxonomySubmitValues {
  key?: string;
  labelEs: string;
  descriptionEs: string;
}

interface TaxonomyFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  entityName: string;
  initialValues?: TaxonomyFormValues;
  onClose: () => void;
  onSubmit: (values: TaxonomySubmitValues) => Promise<void>;
}

function emptyState(): TaxonomyFormValues {
  return { labelEs: '', descriptionEs: '' };
}

export function TaxonomyFormDialog({
  open,
  mode,
  entityName,
  initialValues,
  onClose,
  onSubmit,
}: TaxonomyFormDialogProps): JSX.Element | null {
  const [key, setKey] = useState('');
  const [keyError, setKeyError] = useState<string | undefined>();
  const [form, setForm] = useState<TaxonomyFormValues>(emptyState());
  const [errors, setErrors] = useState<TaxonomyFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const KEY_SCHEMA = z
    .string()
    .min(1, { message: 'Requerido' })
    .max(100, { message: 'Máximo 100 caracteres' })
    .regex(/^[a-z0-9_]+$/, { message: 'Solo minúsculas, dígitos y _' });

  useEffect(() => {
    if (!open) return;
    setKey('');
    setKeyError(undefined);
    setForm(initialValues ?? emptyState());
    setErrors({});
    setSubmitting(false);
  }, [open, initialValues]);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    const field = event.target.name as keyof TaxonomyFormValues;
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors({});

    if (mode === 'create') {
      const keyParsed = KEY_SCHEMA.safeParse(key.trim());
      if (!keyParsed.success) {
        setKeyError(keyParsed.error.issues[0]?.message);
        return;
      }
      setKeyError(undefined);
    }

    const parsed = TaxonomySchema.safeParse({
      labelEs: form.labelEs,
      descriptionEs: form.descriptionEs,
    });
    if (!parsed.success) {
      const fieldErrors: TaxonomyFormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof TaxonomyFormValues;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ ...parsed.data, ...(mode === 'create' && { key: key.trim() }) });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setKeyError('Ya existe un elemento con esa key.');
      } else {
        toast.error(`No se pudo ${mode === 'create' ? 'crear' : 'actualizar'} el elemento.`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === 'create' ? `Añadir ${entityName}` : `Editar ${entityName}`;
  const submitLabel = mode === 'create' ? 'Añadir' : 'Guardar cambios';

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {mode === 'create' && (
          <div className="space-y-1.5">
            <label htmlFor="taxonomy-key" className="block text-sm font-medium">
              Key <span className="text-text-muted font-normal">(identificador único)</span>
            </label>
            <input
              id="taxonomy-key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setKeyError(undefined);
              }}
              disabled={submitting}
              placeholder="mi_categoria"
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 font-mono text-sm outline-none transition"
            />
            {keyError ? <p className="text-danger text-xs">{keyError}</p> : null}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="taxonomy-labelEs" className="block text-sm font-medium">
            Nombre
          </label>
          <input
            id="taxonomy-labelEs"
            name="labelEs"
            value={form.labelEs}
            onChange={handleChange}
            disabled={submitting}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            aria-invalid={Boolean(errors.labelEs)}
          />
          {errors.labelEs ? <p className="text-danger text-xs">{errors.labelEs}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="taxonomy-descriptionEs" className="block text-sm font-medium">
            Descripción
          </label>
          <textarea
            id="taxonomy-descriptionEs"
            name="descriptionEs"
            value={form.descriptionEs}
            onChange={handleChange}
            disabled={submitting}
            rows={3}
            className="border-border bg-bg focus:border-accent w-full rounded-sm border px-3 py-2 text-sm outline-none transition"
            aria-invalid={Boolean(errors.descriptionEs)}
          />
          {errors.descriptionEs ? (
            <p className="text-danger text-xs">{errors.descriptionEs}</p>
          ) : null}
        </div>

        {errors.form ? <p className="text-danger text-sm">{errors.form}</p> : null}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? 'Guardando…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

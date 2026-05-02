'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Modal } from '@/components/Modal';
import { ApiError } from '@/lib/api/client';
import {
  createCredential,
  type CreateCredentialInput,
  type CredentialDto,
} from '@/lib/api/credentials';

interface CreateCredentialDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (cred: CredentialDto) => void;
}

interface FormState {
  key: string;
  provider: string;
  label: string;
  plaintext: string;
}

type FormField = keyof FormState;
type FormErrors = Partial<Record<FormField | 'form', string>>;

const CreateCredentialSchema = z.object({
  key: z
    .string()
    .min(1, { message: 'Requerido' })
    .max(100, { message: 'Máximo 100 caracteres' })
    .regex(/^[a-z0-9_]+$/, { message: 'Solo minúsculas, dígitos y guión bajo (_)' }),
  provider: z
    .string()
    .trim()
    .min(1, { message: 'Requerido' })
    .max(100, { message: 'Máximo 100 caracteres' }),
  label: z
    .string()
    .trim()
    .min(1, { message: 'Requerido' })
    .max(200, { message: 'Máximo 200 caracteres' }),
  plaintext: z
    .string()
    .min(1, { message: 'Requerido' })
    .max(8192, { message: 'Máximo 8192 caracteres' }),
});

function emptyState(): FormState {
  return { key: '', provider: '', label: '', plaintext: '' };
}

function collectFieldErrors(error: z.ZodError<CreateCredentialInput>): FormErrors {
  const fieldErrors: FormErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string') {
      fieldErrors[field as FormField] = issue.message;
    }
  }
  return fieldErrors;
}

export function CreateCredentialDialog({
  open,
  onClose,
  onCreated,
}: CreateCredentialDialogProps): JSX.Element | null {
  const [form, setForm] = useState<FormState>(emptyState());
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPlaintext, setShowPlaintext] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(emptyState());
    setErrors({});
    setSubmitting(false);
    setShowPlaintext(false);
  }, [open]);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const field = event.target.name as FormField;
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors({});

    const payload: CreateCredentialInput = {
      key: form.key.trim(),
      provider: form.provider.trim(),
      label: form.label.trim(),
      plaintext: form.plaintext,
    };

    const parsed = CreateCredentialSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(collectFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      const created = await createCredential(parsed.data);
      onCreated(created);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.error('Ya existe una credencial con esa key.');
      } else {
        toast.error('No se pudo crear la credencial.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function renderFieldError(field: FormField): JSX.Element | null {
    const message = errors[field];
    if (!message) return null;
    return <p className="text-danger text-xs">{message}</p>;
  }

  return (
    <Modal open={open} onClose={onClose} title="Añadir credencial">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="create-cred-key" className="block text-sm font-medium">
              Key <span className="text-text-muted font-normal">(identificador único)</span>
            </label>
            <input
              id="create-cred-key"
              name="key"
              value={form.key}
              onChange={handleInputChange}
              disabled={submitting}
              placeholder="openai_api_key"
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 font-mono text-sm outline-none transition"
              aria-invalid={Boolean(errors.key)}
            />
            {renderFieldError('key')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="create-cred-provider" className="block text-sm font-medium">
              Provider
            </label>
            <input
              id="create-cred-provider"
              name="provider"
              value={form.provider}
              onChange={handleInputChange}
              disabled={submitting}
              placeholder="openai"
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.provider)}
            />
            {renderFieldError('provider')}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="create-cred-label" className="block text-sm font-medium">
              Label
            </label>
            <input
              id="create-cred-label"
              name="label"
              value={form.label}
              onChange={handleInputChange}
              disabled={submitting}
              placeholder="OpenAI API Key (producción)"
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.label)}
            />
            {renderFieldError('label')}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="create-cred-plaintext" className="block text-sm font-medium">
              Secreto
            </label>
            <div className="flex gap-2">
              <input
                id="create-cred-plaintext"
                name="plaintext"
                type={showPlaintext ? 'text' : 'password'}
                value={form.plaintext}
                onChange={handleInputChange}
                disabled={submitting}
                autoComplete="new-password"
                className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                aria-invalid={Boolean(errors.plaintext)}
              />
              <button
                type="button"
                onClick={() => setShowPlaintext((v) => !v)}
                className="border-border bg-surface-muted hover:bg-bg h-10 shrink-0 rounded-md border px-3 text-sm font-medium transition"
              >
                {showPlaintext ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {renderFieldError('plaintext')}
          </div>
        </div>

        {errors.form ? <p className="text-danger text-sm">{errors.form}</p> : null}

        <div className="flex justify-end gap-3">
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
            {submitting ? 'Guardando…' : 'Añadir credencial'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Modal } from '@/components/Modal';
import { rotateCredential, type CredentialDto } from '@/lib/api/credentials';

interface RotateCredentialDialogProps {
  open: boolean;
  credential: CredentialDto | null;
  onClose: () => void;
  onRotated: (cred: CredentialDto) => void;
}

const RotateSchema = z.object({
  newPlaintext: z
    .string()
    .min(1, { message: 'Requerido' })
    .max(8192, { message: 'Máximo 8192 caracteres' }),
});

export function RotateCredentialDialog({
  open,
  credential,
  onClose,
  onRotated,
}: RotateCredentialDialogProps): JSX.Element | null {
  const [newPlaintext, setNewPlaintext] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [showPlaintext, setShowPlaintext] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNewPlaintext('');
    setFieldError(undefined);
    setSubmitting(false);
    setShowPlaintext(false);
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldError(undefined);

    const parsed = RotateSchema.safeParse({ newPlaintext });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }

    if (!credential) return;

    setSubmitting(true);
    try {
      const updated = await rotateCredential(credential.id, {
        newPlaintext: parsed.data.newPlaintext,
      });
      onRotated(updated);
    } catch {
      toast.error('No se pudo rotar la credencial.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Rotar secreto">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <p className="text-text-muted text-sm">
          Introduce el nuevo secreto para{' '}
          {credential ? (
            <code className="bg-surface-muted rounded px-1 font-mono text-xs">
              {credential.key}
            </code>
          ) : (
            'esta credencial'
          )}
          . El secreto anterior quedará invalidado de inmediato.
        </p>

        <div className="space-y-1.5">
          <label htmlFor="rotate-cred-plaintext" className="block text-sm font-medium">
            Nuevo secreto
          </label>
          <div className="flex gap-2">
            <input
              id="rotate-cred-plaintext"
              type={showPlaintext ? 'text' : 'password'}
              value={newPlaintext}
              onChange={(e) => {
                setNewPlaintext(e.target.value);
                setFieldError(undefined);
              }}
              disabled={submitting}
              autoComplete="new-password"
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(fieldError)}
            />
            <button
              type="button"
              onClick={() => setShowPlaintext((v) => !v)}
              className="border-border bg-surface-muted hover:bg-bg h-10 shrink-0 rounded-md border px-3 text-sm font-medium transition"
            >
              {showPlaintext ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {fieldError ? <p className="text-danger text-xs">{fieldError}</p> : null}
        </div>

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
            {submitting ? 'Rotando…' : 'Rotar secreto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

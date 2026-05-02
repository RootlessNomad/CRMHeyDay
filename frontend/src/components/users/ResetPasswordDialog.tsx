'use client';

import { useEffect, useState } from 'react';

import { Modal } from '@/components/Modal';
import { ApiError } from '@/lib/api/client';
import { resetUserPassword, type UserDto } from '@/lib/api/users';

interface ResetPasswordDialogProps {
  open: boolean;
  onClose: () => void;
  user: UserDto | null;
}

type ResetStep = 'confirm' | 'result';

export function ResetPasswordDialog({
  open,
  onClose,
  user,
}: ResetPasswordDialogProps): JSX.Element | null {
  const [step, setStep] = useState<ResetStep>('confirm');
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('confirm');
    setTemporaryPassword(null);
    setSubmitting(false);
    setCopied(false);
    setError(null);
  }, [open, user]);

  async function handleReset(): Promise<void> {
    if (!user) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await resetUserPassword(user.id);
      setTemporaryPassword(result.temporaryPassword);
      setStep('result');
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError('No se pudo resetear la contraseña.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy(): Promise<void> {
    if (!temporaryPassword) return;
    await navigator.clipboard.writeText(temporaryPassword);
    setCopied(true);
  }

  return (
    <Modal open={open} onClose={onClose} title="Resetear contraseña">
      <div className="space-y-5">
        {step === 'confirm' ? (
          <>
            <div className="space-y-2">
              <p className="text-sm">
                ¿Quieres resetear la contraseña de <span className="font-medium">{user?.name}</span>
                ?
              </p>
              <p className="text-text-muted text-sm">
                Se generará una contraseña temporal que tendrás que copiar y compartir ahora.
              </p>
            </div>

            {error ? <p className="text-danger text-sm">{error}</p> : null}

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
                type="button"
                onClick={() => {
                  void handleReset();
                }}
                disabled={submitting || !user}
                className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? 'Reseteando…' : 'Resetear contraseña'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <p className="text-sm">
                Contraseña temporal generada para <span className="font-medium">{user?.email}</span>
                .
              </p>
              <div className="border-border bg-surface-muted flex items-center justify-between gap-3 rounded-lg border p-4">
                <code className="text-sm font-semibold">{temporaryPassword}</code>
                <button
                  type="button"
                  onClick={() => {
                    void handleCopy();
                  }}
                  className="border-border bg-surface hover:bg-bg h-9 rounded-md border px-3 text-sm font-medium transition"
                >
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="text-danger text-sm">
                Esta contraseña solo se muestra una vez. Guárdala antes de cerrar.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
              >
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { deleteCredential, type CredentialDto } from '@/lib/api/credentials';

interface DeleteCredentialDialogProps {
  open: boolean;
  credential: CredentialDto | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteCredentialDialog({
  open,
  credential,
  onClose,
  onDeleted,
}: DeleteCredentialDialogProps): JSX.Element | null {
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmation('');
    setLoading(false);
  }, [open]);

  async function handleDelete(): Promise<void> {
    if (!credential) return;
    setLoading(true);
    try {
      await deleteCredential(credential.id);
      toast.success('Credencial eliminada.');
      onDeleted();
      onClose();
    } catch {
      toast.error('No se pudo eliminar la credencial.');
    } finally {
      setLoading(false);
    }
  }

  const canConfirm = credential !== null && confirmation === credential.key && !loading;

  return (
    <Modal open={open} onClose={onClose} title="Eliminar credencial">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm leading-6">
            Esta acción es permanente. La credencial y sus datos de salud quedarán eliminados y no
            podrán recuperarse.
          </p>
          <p className="text-text-muted text-sm">
            Escribe{' '}
            {credential ? (
              <code className="bg-surface-muted rounded px-1 font-mono text-xs font-semibold">
                {credential.key}
              </code>
            ) : (
              'la key'
            )}{' '}
            para confirmar.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="delete-cred-confirmation" className="block text-sm font-medium">
            Confirmación
          </label>
          <input
            id="delete-cred-confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={loading}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 font-mono text-sm outline-none transition"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canConfirm}
            className="bg-danger h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

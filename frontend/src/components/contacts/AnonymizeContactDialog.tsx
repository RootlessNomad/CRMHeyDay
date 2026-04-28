'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { anonymizeContact } from '@/lib/api/contacts';
import type { ContactDto } from '@/types/contact';

interface AnonymizeContactDialogProps {
  open: boolean;
  onClose: () => void;
  contact: Pick<ContactDto, 'id' | 'first_name' | 'last_name'> | null;
  onAnonymized: () => void;
}

const CONFIRM_TEXT = 'ANONIMIZAR';

export function AnonymizeContactDialog({
  open,
  onClose,
  contact,
  onAnonymized,
}: AnonymizeContactDialogProps): JSX.Element | null {
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(false);
    setConfirmation('');
  }, [open]);

  async function handleAnonymize(): Promise<void> {
    if (!contact) return;
    setLoading(true);
    try {
      await anonymizeContact(contact.id);
      toast.success('Contacto anonimizado.');
      onAnonymized();
      onClose();
    } catch {
      toast.error('No se pudo anonimizar el contacto.');
    } finally {
      setLoading(false);
    }
  }

  const canConfirm = confirmation === CONFIRM_TEXT && !loading;

  return (
    <Modal open={open} onClose={onClose} title="Anonimizar contacto">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm leading-6">
            Esta acción es irreversible. Se eliminarán nombre, email, teléfono y otros datos
            personales. El registro permanecerá para preservar el historial de leads y actividades.
          </p>
          <p className="text-text-muted text-sm">
            Escribe <span className="font-semibold">{CONFIRM_TEXT}</span> para continuar con{' '}
            {contact
              ? `"${[contact.first_name, contact.last_name].filter(Boolean).join(' ')}"`
              : 'este contacto'}
            .
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="anonymize-contact-confirmation" className="block text-sm font-medium">
            Confirmación
          </label>
          <input
            id="anonymize-contact-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={loading}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
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
            onClick={handleAnonymize}
            disabled={!canConfirm}
            className="bg-danger h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Anonimizando…' : 'Anonimizar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

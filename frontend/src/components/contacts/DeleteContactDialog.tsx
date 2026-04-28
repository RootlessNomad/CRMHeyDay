'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { deleteContact } from '@/lib/api/contacts';
import type { ContactDto } from '@/types/contact';

interface DeleteContactDialogProps {
  open: boolean;
  onClose: () => void;
  contact: Pick<ContactDto, 'id' | 'first_name' | 'last_name'> | null;
  onDeleted: () => void;
}

function contactName(contact: Pick<ContactDto, 'first_name' | 'last_name'> | null): string {
  if (!contact) return 'este contacto';
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.first_name;
}

export function DeleteContactDialog({
  open,
  onClose,
  contact,
  onDeleted,
}: DeleteContactDialogProps): JSX.Element | null {
  const [loading, setLoading] = useState(false);

  async function handleDelete(): Promise<void> {
    if (!contact) return;
    setLoading(true);
    try {
      await deleteContact(contact.id);
      onDeleted();
    } catch {
      toast.error('No se pudo eliminar el contacto.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Eliminar contacto">
      <div className="space-y-5">
        <p className="text-sm leading-6">
          Eliminar &quot;{contactName(contact)}&quot;? Podrás recuperarlo desde admin más adelante.
        </p>

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
            disabled={loading}
            className="bg-danger h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

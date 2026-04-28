'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { markWonLead } from '@/lib/api/leads';

interface WonLeadDialogProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  onSuccess: () => void;
}

export function WonLeadDialog({
  open,
  onClose,
  leadId,
  onSuccess,
}: WonLeadDialogProps): JSX.Element | null {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
  }, [open]);

  async function handleConfirm(): Promise<void> {
    setSubmitting(true);
    try {
      await markWonLead(leadId);
      toast.success('Lead marcado como ganado.');
      onSuccess();
      onClose();
    } catch {
      toast.error('No se pudo marcar el lead como ganado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Marcar lead como ganado">
      <div className="space-y-5">
        <p className="text-sm leading-6">
          Esta acción moverá el lead al estado ganado y actualizará su pipeline.
        </p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { markLostLead } from '@/lib/api/leads';

interface LostLeadDialogProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  onSuccess: () => void;
}

export function LostLeadDialog({
  open,
  onClose,
  leadId,
  onSuccess,
}: LostLeadDialogProps): JSX.Element | null {
  const [lostReason, setLostReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLostReason('');
    setError('');
    setSubmitting(false);
  }, [open]);

  async function handleConfirm(): Promise<void> {
    const trimmed = lostReason.trim();
    if (trimmed.length < 1 || trimmed.length > 500) {
      setError('Indica un motivo entre 1 y 500 caracteres.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await markLostLead(leadId, trimmed);
      toast.success('Lead marcado como perdido.');
      onSuccess();
      onClose();
    } catch {
      toast.error('No se pudo marcar el lead como perdido.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Marcar lead como perdido">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="lead-lost-reason" className="block text-sm font-medium">
            Motivo
          </label>
          <textarea
            id="lead-lost-reason"
            value={lostReason}
            onChange={(event) => {
              setLostReason(event.target.value);
              if (error) setError('');
            }}
            disabled={submitting}
            rows={5}
            className="border-border bg-bg focus:border-accent w-full rounded-sm border px-3 py-2 text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
          />
          {error ? <p className="text-danger text-xs">{error}</p> : null}
        </div>

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
            className="bg-danger h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { deleteLead } from '@/lib/api/leads';
import type { LeadDto } from '@/types/lead';

interface DeleteLeadDialogProps {
  open: boolean;
  onClose: () => void;
  lead: LeadDto | null;
  onSuccess: () => void;
}

export function DeleteLeadDialog({
  open,
  onClose,
  lead,
  onSuccess,
}: DeleteLeadDialogProps): JSX.Element | null {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
  }, [open]);

  async function handleConfirm(): Promise<void> {
    if (!lead) return;
    setSubmitting(true);
    try {
      await deleteLead(lead.id);
      toast.success('Lead eliminado.');
      onSuccess();
      onClose();
    } catch {
      toast.error('No se pudo eliminar el lead.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!lead) return null;

  return (
    <Modal open={open} onClose={onClose} title="Eliminar lead">
      <div className="space-y-5">
        <p className="text-sm leading-6">
          Se eliminará el lead de <strong>{lead.company?.name ?? lead.companyId}</strong>.
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
            onClick={() => {
              void handleConfirm();
            }}
            disabled={submitting}
            className="bg-danger h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

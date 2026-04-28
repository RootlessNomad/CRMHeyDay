'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { deleteCompany } from '@/lib/api/companies';
import type { CompanyDto } from '@/types/company';

interface DeleteCompanyDialogProps {
  open: boolean;
  onClose: () => void;
  company: Pick<CompanyDto, 'id' | 'name'> | null;
  onDeleted: () => void;
}

export function DeleteCompanyDialog({
  open,
  onClose,
  company,
  onDeleted,
}: DeleteCompanyDialogProps): JSX.Element | null {
  const [loading, setLoading] = useState(false);

  async function handleDelete(): Promise<void> {
    if (!company) return;
    setLoading(true);
    try {
      await deleteCompany(company.id);
      onDeleted();
    } catch {
      toast.error('No se pudo eliminar la empresa.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Eliminar empresa">
      <div className="space-y-5">
        <p className="text-sm leading-6">
          Eliminar &quot;{company?.name ?? 'esta empresa'}&quot;? Podrás recuperarla desde admin más
          adelante.
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

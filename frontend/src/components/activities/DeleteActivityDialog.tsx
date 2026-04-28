'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { deleteActivity } from '@/lib/api/activities';
import type { ActivityDto } from '@/types/activity';

interface DeleteActivityDialogProps {
  open: boolean;
  onClose: () => void;
  activity: Pick<ActivityDto, 'id' | 'title' | 'kind'> | null;
  onSuccess: () => void;
}

function activityLabel(activity: Pick<ActivityDto, 'title' | 'kind'> | null): string {
  if (!activity) return 'esta actividad';
  return activity.title?.trim() || activity.kind;
}

export function DeleteActivityDialog({
  open,
  onClose,
  activity,
  onSuccess,
}: DeleteActivityDialogProps): JSX.Element | null {
  const [loading, setLoading] = useState(false);

  async function handleDelete(): Promise<void> {
    if (!activity) return;
    setLoading(true);
    try {
      await deleteActivity(activity.id);
      onSuccess();
    } catch {
      toast.error('No se pudo eliminar la actividad.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Eliminar actividad">
      <div className="space-y-5">
        <p className="text-sm leading-6">Eliminar &quot;{activityLabel(activity)}&quot;?</p>

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

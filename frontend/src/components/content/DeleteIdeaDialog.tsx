'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { deleteIdea, type IdeaDto } from '@/lib/api/content';

interface DeleteIdeaDialogProps {
  idea: IdeaDto;
  open: boolean;
  onClose: () => void;
}

export function DeleteIdeaDialog({
  idea,
  open,
  onClose,
}: DeleteIdeaDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteIdea(idea.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['content', 'ideas'] });
      toast.success('Idea eliminada');
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la idea.');
    },
  });

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Eliminar idea">
      <div className="space-y-4">
        <p className="text-sm">
          Vas a eliminar <span className="font-medium">{idea.title}</span>. Esta acción también
          eliminará los ContentItems asociados a esta idea.
        </p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="h-10 rounded-md bg-red-600 px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

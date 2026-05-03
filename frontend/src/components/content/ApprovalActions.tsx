'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  approveItem,
  rejectItem,
  submitForReview,
  type ContentItemDetailDto,
} from '@/lib/api/content';

interface ApprovalActionsProps {
  itemId: string;
  status: ContentItemDetailDto['status'];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo actualizar el estado';
}

export function ApprovalActions({ itemId, status }: ApprovalActionsProps): JSX.Element | null {
  const queryClient = useQueryClient();

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['content', 'item', itemId] });
    await queryClient.invalidateQueries({ queryKey: ['content', 'reviews'] });
  };

  const submitMutation = useMutation({
    mutationFn: () => submitForReview(itemId),
    onSuccess: async () => {
      await refresh();
      toast.success('Enviado a revisión');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => approveItem(itemId),
    onSuccess: async () => {
      await refresh();
      toast.success('Contenido aprobado');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectItem(itemId),
    onSuccess: async () => {
      await refresh();
      toast.success('Contenido rechazado');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  if (status === 'draft') {
    return (
      <button
        type="button"
        onClick={() => submitMutation.mutate()}
        disabled={submitMutation.isPending}
        className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitMutation.isPending ? '…' : 'Enviar a revisión'}
      </button>
    );
  }

  if (status === 'in_review') {
    const isPending = approveMutation.isPending || rejectMutation.isPending;

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => approveMutation.mutate()}
          disabled={isPending}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approveMutation.isPending ? '…' : 'Aprobar'}
        </button>
        <button
          type="button"
          onClick={() => rejectMutation.mutate()}
          disabled={isPending}
          className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {rejectMutation.isPending ? '…' : 'Rechazar'}
        </button>
      </div>
    );
  }

  return null;
}

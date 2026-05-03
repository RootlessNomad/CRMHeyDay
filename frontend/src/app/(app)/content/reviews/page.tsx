'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';

import {
  CHANNEL_LABELS,
  ITEM_STATUS_LABELS,
  approveItem,
  listPendingReviews,
  rejectItem,
} from '@/lib/api/content';

const PAGE_SIZE = 20;

const STATUS_STYLES: Record<string, string> = {
  in_review: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  exported: 'border-sky-200 bg-sky-50 text-sky-700',
  archived: 'border-border bg-surface-muted text-text-muted',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo actualizar el estado';
}

export default function ContentReviewsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);

  const reviewsQuery = useQuery({
    queryKey: ['content', 'reviews', offset],
    queryFn: () => listPendingReviews({ limit: PAGE_SIZE, offset }),
  });

  const approveMutation = useMutation({
    mutationFn: (itemId: string) => approveItem(itemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['content', 'reviews'] });
      toast.success('Contenido aprobado');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (itemId: string) => rejectItem(itemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['content', 'reviews'] });
      toast.success('Contenido rechazado');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const data = reviewsQuery.data;
  const total = data?.total ?? 0;
  const canGoPrev = offset > 0;
  const canGoNext = offset + PAGE_SIZE < total;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Aprobaciones pendientes</h1>
          <p className="text-text-muted text-sm">
            Revisa los borradores en cola antes de aprobar su salida.
          </p>
        </div>
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
          {total} pendientes
        </span>
      </header>

      {reviewsQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="border-border bg-surface animate-pulse rounded-2xl border p-5 shadow-sm"
            >
              <div className="bg-surface-muted h-4 w-28 rounded" />
              <div className="bg-surface-muted mt-4 h-6 w-48 rounded" />
              <div className="bg-surface-muted mt-4 h-4 w-72 rounded" />
            </div>
          ))}
        </div>
      ) : null}

      {reviewsQuery.isError ? (
        <div className="border-border bg-surface rounded-2xl border p-6 text-sm text-red-600 shadow-sm">
          No se pudo cargar la cola de aprobaciones.
        </div>
      ) : null}

      {!reviewsQuery.isLoading && !reviewsQuery.isError && data ? (
        <>
          {data.total === 0 ? (
            <div className="border-border bg-surface rounded-2xl border p-8 text-center shadow-sm">
              <p className="text-lg font-semibold">No hay borradores pendientes de revisión</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.items.map((item) => {
                const lastEvent = item.approval_events[0] ?? null;
                const isPending = approveMutation.isPending || rejectMutation.isPending;

                return (
                  <article
                    key={item.id}
                    className="border-border bg-surface rounded-2xl border p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-semibold">
                            {CHANNEL_LABELS[item.channel] ?? item.channel}
                          </span>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                              STATUS_STYLES[item.status] ?? STATUS_STYLES['archived']
                            }`}
                          >
                            {ITEM_STATUS_LABELS[item.status] ?? item.status}
                          </span>
                        </div>

                        <div className="text-text-muted flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          <span>Creado el {formatDate(item.created_at)}</span>
                          {lastEvent ? (
                            <span>
                              Último envío por {lastEvent.actor_id} el{' '}
                              {formatDate(lastEvent.created_at)}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => approveMutation.mutate(item.id)}
                            disabled={isPending}
                            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {approveMutation.isPending ? '…' : 'Aprobar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectMutation.mutate(item.id)}
                            disabled={isPending}
                            className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {rejectMutation.isPending ? '…' : 'Rechazar'}
                          </button>
                          <Link
                            href={`/content/items/${item.id}`}
                            className="text-sm underline underline-offset-4"
                          >
                            Ver editor
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {data.total > 0 ? (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                disabled={!canGoPrev}
                className="border-border hover:bg-surface-muted rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                Anterior
              </button>
              <span className="text-text-muted text-sm">
                {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} de {total}
              </span>
              <button
                type="button"
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
                disabled={!canGoNext}
                className="border-border hover:bg-surface-muted rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                Siguiente
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

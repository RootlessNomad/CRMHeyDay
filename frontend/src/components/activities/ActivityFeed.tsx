'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { useAuthStore } from '@/lib/auth/store';
import { listActivities, updateActivity } from '@/lib/api/activities';
import type { ActivityDto, ActivityEntityType, ActivityKind } from '@/types/activity';

import { ActivityFormDialog } from './ActivityFormDialog';
import { DeleteActivityDialog } from './DeleteActivityDialog';

interface ActivityFeedProps {
  entityType: ActivityEntityType;
  entityId: string;
}

type CompletionFilter = 'pending' | 'all' | 'completed';
type OwnerFilter = 'all' | 'mine';

const KIND_LABELS: Record<ActivityKind, string> = {
  note: 'Nota',
  task: 'Tarea',
  call_log: 'Llamada',
  email_log: 'Email',
  meeting_log: 'Reunión',
};

function formatRelativeDate(input: string): string {
  const date = new Date(input);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, 'day');
}

function activityTimestamp(activity: ActivityDto): string {
  return activity.due_at ?? activity.created_at;
}

function activityTitle(activity: ActivityDto): string {
  if (activity.title?.trim()) return activity.title;
  return KIND_LABELS[activity.kind];
}

export function ActivityFeed({ entityType, entityId }: ActivityFeedProps): JSX.Element {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id ?? '');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>('pending');
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityDto | null>(null);
  const [deletingActivity, setDeletingActivity] = useState<ActivityDto | null>(null);

  const filters = {
    entity_type: entityType,
    entity_id: entityId,
    kind: kindFilter === 'all' ? undefined : (kindFilter as ActivityKind),
    completed: completionFilter === 'all' ? undefined : completionFilter === 'completed',
    owner_id: ownerFilter === 'mine' && currentUserId ? currentUserId : undefined,
    page: 1,
    page_size: 50,
  };

  const activitiesQuery = useQuery({
    queryKey: ['activities', entityType, entityId, filters],
    queryFn: () => listActivities(filters),
  });

  async function invalidateActivities(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['activities', entityType, entityId] });
  }

  const toggleMutation = useMutation({
    mutationFn: async (activity: ActivityDto) =>
      updateActivity(activity.id, {
        completed_at: activity.completed_at ? null : new Date().toISOString(),
      }),
    onSuccess: async (_activity, source) => {
      toast.success(
        source.completed_at ? 'Actividad marcada como pendiente.' : 'Actividad completada.',
      );
      await invalidateActivities();
    },
    onError: () => {
      toast.error('No se pudo actualizar la actividad.');
    },
  });

  const activities = activitiesQuery.data?.rows ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-transparent md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Actividad</h2>
          <p className="text-text-muted text-sm">Notas, tareas y registros relacionados.</p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-accent text-bg h-10 rounded-md px-4 text-sm font-medium transition hover:opacity-90"
        >
          Nueva actividad
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="activity-filter-kind" className="block text-sm font-medium">
            Tipo
          </label>
          <select
            id="activity-filter-kind"
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value)}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
          >
            <option value="all">Todas</option>
            <option value="note">Nota</option>
            <option value="task">Tarea</option>
            <option value="call_log">Llamada</option>
            <option value="email_log">Email</option>
            <option value="meeting_log">Reunión</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="activity-filter-completed" className="block text-sm font-medium">
            Estado
          </label>
          <select
            id="activity-filter-completed"
            value={completionFilter}
            onChange={(event) => setCompletionFilter(event.target.value as CompletionFilter)}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
          >
            <option value="pending">Pendientes</option>
            <option value="all">Todos</option>
            <option value="completed">Completados</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="activity-filter-owner" className="block text-sm font-medium">
            Visibilidad
          </label>
          <select
            id="activity-filter-owner"
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value as OwnerFilter)}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
          >
            <option value="all">Todos</option>
            <option value="mine">Mías</option>
          </select>
        </div>
      </div>

      {activitiesQuery.isLoading ? (
        <div className="border-border bg-surface rounded-lg border p-8 text-center shadow-sm">
          <div className="border-text-muted mx-auto h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        </div>
      ) : null}

      {activitiesQuery.isError ? (
        <div className="border-border bg-surface rounded-lg border p-6 text-sm shadow-sm">
          No se pudieron cargar las actividades.
        </div>
      ) : null}

      {!activitiesQuery.isLoading && !activitiesQuery.isError && activities.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border p-8 text-center shadow-sm">
          <h3 className="text-base font-medium">No hay actividades aún</h3>
        </div>
      ) : null}

      {!activitiesQuery.isLoading && !activitiesQuery.isError && activities.length > 0 ? (
        <div className="space-y-3">
          {activities.map((activity) => {
            const toggling =
              toggleMutation.isPending && toggleMutation.variables?.id === activity.id;

            return (
              <article
                key={activity.id}
                className="border-border bg-surface rounded-lg border p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-surface-muted rounded-full px-2.5 py-1 text-xs font-medium">
                        {KIND_LABELS[activity.kind]}
                      </span>
                      <span className="text-text-muted text-xs">
                        {formatRelativeDate(activityTimestamp(activity))}
                      </span>
                      {activity.completed_at ? (
                        <span className="bg-accent-soft rounded-full px-2.5 py-1 text-xs font-medium">
                          Completada
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold">{activityTitle(activity)}</h3>
                      {activity.body ? (
                        <p
                          className="text-text-muted overflow-hidden whitespace-pre-wrap text-sm"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {activity.body}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="border-border bg-surface-muted flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(activity.completed_at)}
                        onChange={() => toggleMutation.mutate(activity)}
                        disabled={toggling}
                        className="accent-accent h-4 w-4"
                      />
                      Hecha
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditingActivity(activity)}
                      className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-3 text-sm font-medium transition"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingActivity(activity)}
                      className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-3 text-sm font-medium transition"
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <ActivityFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        entityType={entityType}
        entityId={entityId}
        onSuccess={() => {
          void invalidateActivities();
          setCreateOpen(false);
        }}
      />

      <ActivityFormDialog
        open={Boolean(editingActivity)}
        onClose={() => setEditingActivity(null)}
        mode="edit"
        activity={editingActivity ?? undefined}
        entityType={entityType}
        entityId={entityId}
        onSuccess={() => {
          void invalidateActivities();
          setEditingActivity(null);
        }}
      />

      <DeleteActivityDialog
        open={Boolean(deletingActivity)}
        onClose={() => setDeletingActivity(null)}
        activity={deletingActivity}
        onSuccess={() => {
          setDeletingActivity(null);
          void invalidateActivities();
          toast.success('Actividad eliminada.');
        }}
      />
    </div>
  );
}

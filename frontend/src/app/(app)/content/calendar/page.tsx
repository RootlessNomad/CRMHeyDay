'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { CalendarItemBadge } from '@/components/content/CalendarItemBadge';
import {
  VERTICAL_LABELS,
  listCalendarItems,
  rescheduleItem,
  type CalendarItemDto,
} from '@/lib/api/content';

type CalendarFilters = {
  channel: string;
  status: string;
  icp_vertical: string;
};

const WEEKDAY_LABELS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthRange(year: number, month: number): { from: string; to: string } {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return {
    from: formatDateKey(firstDay),
    to: formatDateKey(lastDay),
  };
}

function getMonthCells(year: number, month: number): Array<Date | null> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: Array<Date | null> = Array.from({ length: firstDayIndex }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo actualizar la fecha';
}

export default function ContentCalendarPage(): JSX.Element {
  const today = new Date();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [filters, setFilters] = useState<CalendarFilters>({
    channel: '',
    status: '',
    icp_vertical: '',
  });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState('');

  const { from, to } = getMonthRange(year, month);
  const cells = getMonthCells(year, month);

  const calendarQuery = useQuery({
    queryKey: ['content', 'calendar', year, month, filters],
    queryFn: () =>
      listCalendarItems({
        from,
        to,
        ...(filters.channel ? { channel: filters.channel } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.icp_vertical ? { icp_vertical: filters.icp_vertical } : {}),
      }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ itemId, scheduledFor }: { itemId: string; scheduledFor: string | null }) =>
      rescheduleItem(itemId, scheduledFor),
    onSuccess: async () => {
      setEditingItemId(null);
      setEditingDate('');
      await queryClient.invalidateQueries({ queryKey: ['content', 'calendar'] });
      toast.success('Fecha actualizada');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const itemsByDate = new Map<string, CalendarItemDto[]>();
  for (const item of calendarQuery.data ?? []) {
    if (!item.scheduled_for) continue;
    const currentItems = itemsByDate.get(item.scheduled_for) ?? [];
    currentItems.push(item);
    itemsByDate.set(item.scheduled_for, currentItems);
  }

  function goToPreviousMonth(): void {
    if (month === 0) {
      setYear((current) => current - 1);
      setMonth(11);
      return;
    }
    setMonth((current) => current - 1);
  }

  function goToNextMonth(): void {
    if (month === 11) {
      setYear((current) => current + 1);
      setMonth(0);
      return;
    }
    setMonth((current) => current + 1);
  }

  function startEditing(item: CalendarItemDto): void {
    setEditingItemId(item.id);
    setEditingDate(item.scheduled_for ?? '');
  }

  async function submitReschedule(itemId: string): Promise<void> {
    await rescheduleMutation.mutateAsync({
      itemId,
      scheduledFor: editingDate || null,
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario editorial</h1>
          <p className="text-text-muted mt-1 text-sm">
            Vista mensual de publicaciones programadas por canal, estado y vertical.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={goToPreviousMonth}
            className="border-border bg-surface-muted hover:bg-bg inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium transition"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>
          <div className="border-border bg-surface min-w-52 rounded-md border px-4 py-2 text-center text-sm font-medium capitalize shadow-sm">
            {new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(
              new Date(year, month, 1),
            )}
          </div>
          <button
            type="button"
            onClick={goToNextMonth}
            className="border-border bg-surface-muted hover:bg-bg inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium transition"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-border bg-surface rounded-2xl border p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={filters.channel}
            onChange={(event) =>
              setFilters((current) => ({ ...current, channel: event.target.value }))
            }
            className="border-border bg-bg h-10 rounded-md border px-3 text-sm outline-none"
          >
            <option value="">Todos los canales</option>
            <option value="instagram">Instagram</option>
            <option value="linkedin">LinkedIn</option>
            <option value="newsletter">Newsletter</option>
          </select>

          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value }))
            }
            className="border-border bg-bg h-10 rounded-md border px-3 text-sm outline-none"
          >
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="in_review">En revisión</option>
            <option value="approved">Aprobado</option>
            <option value="exported">Exportado</option>
            <option value="archived">Archivado</option>
          </select>

          <select
            value={filters.icp_vertical}
            onChange={(event) =>
              setFilters((current) => ({ ...current, icp_vertical: event.target.value }))
            }
            className="border-border bg-bg h-10 rounded-md border px-3 text-sm outline-none"
          >
            <option value="">Todas las verticales</option>
            {Object.entries(VERTICAL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {calendarQuery.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-surface-muted h-48 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : calendarQuery.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm text-red-700">
            {calendarQuery.error instanceof Error
              ? calendarQuery.error.message
              : 'No se pudo cargar el calendario.'}
          </p>
        </div>
      ) : (
        <section className="border-border bg-surface overflow-hidden rounded-2xl border shadow-sm">
          <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="text-text-muted border-border border-r px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] last:border-r-0"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7">
            {cells.map((date, index) => {
              if (!date) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="border-border bg-bg min-h-44 border-b border-r last:border-r-0"
                  />
                );
              }

              const dateKey = formatDateKey(date);
              const items = itemsByDate.get(dateKey) ?? [];

              return (
                <div
                  key={dateKey}
                  className="border-border bg-surface min-h-44 border-b border-r p-3 last:border-r-0"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">{date.getDate()}</span>
                    <span className="text-text-muted text-xs">{items.length} items</span>
                  </div>

                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="border-border bg-surface-muted rounded-xl border p-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => router.push(`/content/items/${item.id}`)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <CalendarItemBadge channel={item.channel} status={item.status} />
                            <p className="mt-2 truncate text-sm font-medium">{item.idea_title}</p>
                            <p className="text-text-muted mt-1 truncate text-xs">
                              {item.pillar_label}
                            </p>
                          </button>

                          <button
                            type="button"
                            aria-label={`Reprogramar ${item.idea_title}`}
                            onClick={() => startEditing(item)}
                            className="text-text-muted hover:text-text rounded-md p-1 transition"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>

                        {editingItemId === item.id ? (
                          <div className="mt-3 flex flex-col gap-2">
                            <input
                              type="date"
                              value={editingDate}
                              onChange={(event) => setEditingDate(event.target.value)}
                              className="border-border bg-bg h-10 rounded-md border px-3 text-sm outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void submitReschedule(item.id)}
                                disabled={rescheduleMutation.isPending}
                                className="bg-accent rounded-md px-3 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItemId(null);
                                  setEditingDate('');
                                }}
                                className="border-border bg-bg hover:bg-surface rounded-md border px-3 py-2 text-xs font-medium transition"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void rescheduleMutation.mutateAsync({
                                    itemId: item.id,
                                    scheduledFor: null,
                                  })
                                }
                                disabled={rescheduleMutation.isPending}
                                className="text-text-muted hover:bg-bg rounded-md px-2 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Limpiar
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {(calendarQuery.data?.length ?? 0) === 0 ? (
            <div className="border-border bg-surface px-6 py-10 text-center">
              <p className="text-sm font-medium">No hay publicaciones programadas este mes.</p>
              <p className="text-text-muted mt-2 text-sm">
                Ajusta los filtros o mueve el calendario a otro mes.
              </p>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

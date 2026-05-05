'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import {
  type CalendarEventDto,
  type CalendarFilterVisibility,
  listCalendarEvents,
} from '@/lib/api/calendar';

import { CalendarEventDialog } from './CalendarEventDialog';
import { CalendarMonthView, getMonthGridRange } from './CalendarMonthView';
import { CalendarWeekView, getWeekRange } from './CalendarWeekView';

type CalendarView = 'month' | 'week';
type DialogState =
  | { open: false }
  | { open: true; mode: 'create'; date: Date }
  | { open: true; mode: 'edit'; event: CalendarEventDto };

function startOfWeek(date: Date): Date {
  const day = (date.getDay() + 6) % 7;
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() - day);
  return next;
}

function getMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(date);
}

function getWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const startDay = new Intl.DateTimeFormat('es-ES', { day: 'numeric' }).format(weekStart);
  const endDay = new Intl.DateTimeFormat('es-ES', { day: 'numeric' }).format(weekEnd);
  const monthYear = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
  }).format(weekEnd);

  return `${startDay}\u2013${endDay} ${monthYear}`;
}

export default function CalendarPage(): JSX.Element {
  const today = new Date();
  const [view, setView] = useState<CalendarView>('month');
  const [visibility, setVisibility] = useState<CalendarFilterVisibility>('both');
  const [referenceDate, setReferenceDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  const [dialogState, setDialogState] = useState<DialogState>({ open: false });

  const monthDate = useMemo(
    () => new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1),
    [referenceDate],
  );
  const weekStart = useMemo(() => startOfWeek(referenceDate), [referenceDate]);
  const range = view === 'month' ? getMonthGridRange(monthDate) : getWeekRange(weekStart);

  const calendarQuery = useQuery({
    queryKey: ['calendar', 'events', view, range.from, range.to, visibility],
    queryFn: () =>
      listCalendarEvents({
        from: range.from,
        to: range.to,
        visibility,
      }),
  });

  function goToPrevious(): void {
    if (view === 'month') {
      setReferenceDate(
        (current) => new Date(current.getFullYear(), current.getMonth() - 1, current.getDate()),
      );
      return;
    }

    setReferenceDate((current) => {
      const next = new Date(current);
      next.setDate(current.getDate() - 7);
      return next;
    });
  }

  function goToNext(): void {
    if (view === 'month') {
      setReferenceDate(
        (current) => new Date(current.getFullYear(), current.getMonth() + 1, current.getDate()),
      );
      return;
    }

    setReferenceDate((current) => {
      const next = new Date(current);
      next.setDate(current.getDate() + 7);
      return next;
    });
  }

  function goToToday(): void {
    setReferenceDate(new Date());
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="border-border bg-surface-muted inline-flex rounded-md border p-1">
            <button
              type="button"
              onClick={() => setView('month')}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                view === 'month' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setView('week')}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                view === 'week' ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              Semanal
            </button>
          </div>

          <div className="border-border bg-surface-muted inline-flex rounded-full border p-1">
            {[
              { value: 'personal', label: 'Mis eventos' },
              { value: 'general', label: 'Generales' },
              { value: 'both', label: 'Ambos' },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setVisibility(item.value as CalendarFilterVisibility)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  visibility === item.value ? 'bg-surface text-text shadow-sm' : 'text-text-muted'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDialogState({ open: true, mode: 'create', date: new Date() })}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Nuevo evento
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goToPrevious}
            className="border-border bg-surface-muted hover:bg-bg inline-flex h-10 w-10 items-center justify-center rounded-md border transition"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={goToNext}
            className="border-border bg-surface-muted hover:bg-bg inline-flex h-10 w-10 items-center justify-center rounded-md border transition"
            aria-label="Siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="border-border bg-surface min-w-52 rounded-md border px-4 py-2 text-center text-sm font-medium capitalize shadow-sm">
          {view === 'month' ? getMonthLabel(monthDate) : getWeekLabel(weekStart)}
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
      ) : view === 'month' ? (
        <CalendarMonthView
          monthDate={monthDate}
          events={calendarQuery.data ?? []}
          onSelectDate={(date) => setDialogState({ open: true, mode: 'create', date })}
          onSelectEvent={(event) => setDialogState({ open: true, mode: 'edit', event })}
        />
      ) : (
        <CalendarWeekView
          weekStart={weekStart}
          events={calendarQuery.data ?? []}
          onSelectDate={(date) => setDialogState({ open: true, mode: 'create', date })}
          onSelectEvent={(event) => setDialogState({ open: true, mode: 'edit', event })}
        />
      )}

      <CalendarEventDialog
        open={dialogState.open}
        mode={dialogState.open ? dialogState.mode : 'create'}
        event={dialogState.open && dialogState.mode === 'edit' ? dialogState.event : undefined}
        initialDate={
          dialogState.open && dialogState.mode === 'create' ? dialogState.date : undefined
        }
        onClose={() => setDialogState({ open: false })}
      />
    </div>
  );
}

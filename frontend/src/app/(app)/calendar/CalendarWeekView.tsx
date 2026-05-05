'use client';

import type { CalendarEventDto } from '@/lib/api/calendar';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface CalendarWeekViewProps {
  weekStart: Date;
  events: CalendarEventDto[];
  onSelectDate: (date: Date) => void;
  onSelectEvent: (event: CalendarEventDto) => void;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function getDaysForWeek(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
}

function getEventDays(event: CalendarEventDto): string[] {
  const days: string[] = [];
  const cursor = startOfDay(new Date(event.startsAt));
  const last = startOfDay(new Date(event.endsAt));

  while (cursor.getTime() <= last.getTime()) {
    days.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function getEventChipColor(event: CalendarEventDto): string {
  return event.color ?? (event.visibility === 'general' ? '#2563eb' : '#7c3aed');
}

export function getWeekRange(weekStart: Date): { from: string; to: string } {
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);

  return {
    from: startOfDay(weekStart).toISOString(),
    to: endOfDay(end).toISOString(),
  };
}

export function CalendarWeekView({
  weekStart,
  events,
  onSelectDate,
  onSelectEvent,
}: CalendarWeekViewProps): JSX.Element {
  const days = getDaysForWeek(weekStart);
  const itemsByDate = new Map<string, CalendarEventDto[]>();

  for (const event of events) {
    for (const day of getEventDays(event)) {
      const currentItems = itemsByDate.get(day) ?? [];
      currentItems.push(event);
      itemsByDate.set(day, currentItems);
    }
  }

  for (const [key, value] of itemsByDate.entries()) {
    value.sort((left, right) => {
      if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
      return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
    });
    itemsByDate.set(key, value);
  }

  return (
    <section className="border-border bg-surface overflow-hidden rounded-2xl border shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-7">
        {days.map((day, index) => {
          const dateKey = formatDateKey(day);
          const dayEvents = itemsByDate.get(dateKey) ?? [];

          return (
            <div
              key={dateKey}
              onClick={() => onSelectDate(day)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectDate(day);
                }
              }}
              role="button"
              tabIndex={0}
              className="border-border hover:bg-bg min-h-96 border-r p-3 text-left transition last:border-r-0"
            >
              <div className="border-border mb-3 border-b pb-3">
                <div className="text-text-muted text-xs font-semibold uppercase tracking-[0.14em]">
                  {WEEKDAY_LABELS[index]}
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {new Intl.DateTimeFormat('es-ES', {
                    day: 'numeric',
                    month: 'short',
                  }).format(day)}
                </div>
              </div>

              <div className="space-y-2">
                {dayEvents.length === 0 ? (
                  <div className="text-text-muted rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-sm">
                    Sin eventos
                  </div>
                ) : (
                  dayEvents.map((event) => (
                    <button
                      key={`${event.id}-${dateKey}`}
                      type="button"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onSelectEvent(event);
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-white shadow-sm transition hover:opacity-90"
                      style={{ backgroundColor: getEventChipColor(event) }}
                    >
                      <div className="truncate text-sm font-medium">{event.title}</div>
                      <div className="mt-1 text-xs text-white/85">
                        {event.allDay
                          ? 'Todo el día'
                          : new Intl.DateTimeFormat('es-ES', {
                              hour: '2-digit',
                              minute: '2-digit',
                            }).format(new Date(event.startsAt))}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

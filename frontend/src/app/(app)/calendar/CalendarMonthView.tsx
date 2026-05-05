'use client';

import type { CalendarEventDto } from '@/lib/api/calendar';

const WEEKDAY_LABELS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

export interface CalendarMonthCell {
  date: Date;
  isCurrentMonth: boolean;
}

interface CalendarMonthViewProps {
  monthDate: Date;
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

function getMonthCells(monthDate: Date): CalendarMonthCell[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstDayIndex = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstDayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      isCurrentMonth: date.getMonth() === month,
    };
  });
}

function getEventChipColor(event: CalendarEventDto): string {
  return event.color ?? (event.visibility === 'general' ? '#2563eb' : '#7c3aed');
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function getMonthGridRange(monthDate: Date): { from: string; to: string } {
  const cells = getMonthCells(monthDate);
  const firstCell = cells[0];
  const lastCell = cells[cells.length - 1];

  return {
    from: startOfDay(firstCell?.date ?? monthDate).toISOString(),
    to: endOfDay(lastCell?.date ?? monthDate).toISOString(),
  };
}

export function CalendarMonthView({
  monthDate,
  events,
  onSelectDate,
  onSelectEvent,
}: CalendarMonthViewProps): JSX.Element {
  const today = new Date();
  const cells = getMonthCells(monthDate);
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
        {cells.map((cell) => {
          const dateKey = formatDateKey(cell.date);
          const cellEvents = itemsByDate.get(dateKey) ?? [];
          const visibleEvents = cellEvents.slice(0, 3);
          const overflowCount = cellEvents.length - visibleEvents.length;
          const isToday = isSameDay(cell.date, today);

          return (
            <div
              key={dateKey}
              onClick={() => onSelectDate(cell.date)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectDate(cell.date);
                }
              }}
              role="button"
              tabIndex={0}
              className="border-border hover:bg-bg min-h-44 border-b border-r p-3 text-left align-top transition last:border-r-0"
            >
              <div className="mb-3 flex items-center justify-between">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                    isToday ? 'bg-accent text-white' : 'bg-surface-muted text-text'
                  }`}
                >
                  {cell.date.getDate()}
                </span>
                {!cell.isCurrentMonth ? (
                  <span className="text-text-muted text-xs">
                    {new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(cell.date)}
                  </span>
                ) : null}
              </div>

              <div className="space-y-2">
                {visibleEvents.map((event) => (
                  <button
                    key={`${event.id}-${dateKey}`}
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onSelectEvent(event);
                    }}
                    className="w-full rounded-md px-2 py-1 text-left text-xs font-medium text-white shadow-sm transition hover:opacity-90"
                    style={{ backgroundColor: getEventChipColor(event) }}
                    title={event.title}
                  >
                    <span className="block truncate">{event.title}</span>
                  </button>
                ))}
                {overflowCount > 0 ? (
                  <div className="text-text-muted px-1 text-xs font-medium">
                    +{overflowCount} más
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalendarEventDto } from '@/lib/api/calendar';
import { useAuthStore } from '@/lib/auth/store';

import { CalendarEventDialog } from './CalendarEventDialog';
import { CalendarMonthView } from './CalendarMonthView';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/contacts/CompanyPicker', () => ({
  CompanyPicker: ({ value }: { value: { id: string; name: string } | null }) => (
    <input aria-label="Empresa" readOnly value={value?.name ?? ''} />
  ),
}));

function renderWithProviders(node: JSX.Element): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function CalendarMonthHarness(): JSX.Element {
  const [dialogState, setDialogState] = useState<
    | { open: false }
    | { open: true; mode: 'create'; date: Date }
    | { open: true; mode: 'edit'; event: CalendarEventDto }
  >({ open: false });

  const events: CalendarEventDto[] = [
    {
      id: 'event_1',
      ownerId: 'user_1',
      createdById: 'user_1',
      title: 'Kickoff',
      description: null,
      location: null,
      startsAt: '2026-05-15T09:00:00.000Z',
      endsAt: '2026-05-15T10:00:00.000Z',
      allDay: false,
      visibility: 'personal' as const,
      relatedEntityType: null,
      relatedEntityId: null,
      color: null,
      createdAt: '2026-05-01T09:00:00.000Z',
      updatedAt: '2026-05-01T09:00:00.000Z',
    },
  ];

  return (
    <>
      <CalendarMonthView
        monthDate={new Date(2026, 4, 1)}
        events={events}
        onSelectDate={(date) => setDialogState({ open: true, mode: 'create', date })}
        onSelectEvent={(event) => setDialogState({ open: true, mode: 'edit', event })}
      />

      <CalendarEventDialog
        open={dialogState.open}
        mode={dialogState.open ? dialogState.mode : 'create'}
        event={dialogState.open && dialogState.mode === 'edit' ? dialogState.event : undefined}
        initialDate={
          dialogState.open && dialogState.mode === 'create' ? dialogState.date : undefined
        }
        onClose={() => setDialogState({ open: false })}
      />
    </>
  );
}

describe('CalendarMonthView', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession({
      user: {
        id: 'user_1',
        email: 'alex@heyday.test',
        name: 'Alex',
        role: 'admin',
        isActive: true,
        lastLoginAt: null,
      },
      accessToken: 'tok_1',
      accessExpiresAt: new Date().toISOString(),
    });
  });

  it('renderiza eventos en la rejilla mensual', () => {
    renderWithProviders(<CalendarMonthHarness />);

    expect(screen.getByText('Kickoff')).toBeInTheDocument();
  });

  it('abre el diálogo de edición al pulsar un evento', () => {
    renderWithProviders(<CalendarMonthHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Kickoff' }));

    expect(screen.getByRole('heading', { name: /editar evento/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/título/i)).toHaveValue('Kickoff');
  });

  it('abre creación con la fecha pre-rellenada al pulsar una celda vacía', () => {
    renderWithProviders(<CalendarMonthHarness />);

    const targetCell = screen.getByText('16').closest('[role="button"]');
    expect(targetCell).not.toBeNull();

    fireEvent.click(targetCell as HTMLElement);

    expect(screen.getByRole('heading', { name: /nuevo evento/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/inicio/i)).toHaveValue('2026-05-16T09:00');
  });
});

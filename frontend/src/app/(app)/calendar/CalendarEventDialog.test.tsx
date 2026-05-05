/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/lib/auth/store';

import { CalendarEventDialog } from './CalendarEventDialog';

const createMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/contacts/CompanyPicker', () => ({
  CompanyPicker: ({
    value,
    onChange,
    inputId,
  }: {
    value: { id: string; name: string } | null;
    onChange: (next: { id: string; name: string } | null) => void;
    inputId?: string;
  }) => (
    <div>
      <input id={inputId} aria-label="Empresa" readOnly value={value?.name ?? ''} />
      <button type="button" onClick={() => onChange({ id: 'company_1', name: 'Acme' })}>
        Seleccionar empresa mock
      </button>
    </div>
  ),
}));

vi.mock('@/lib/api/leads', () => ({
  getLead: vi.fn().mockResolvedValue(null),
  listLeads: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 8, total: 0 }),
}));

vi.mock('@/lib/api/contacts', () => ({
  getContact: vi.fn().mockResolvedValue(null),
  listContacts: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 8, total: 0 }),
}));

vi.mock('@/lib/api/companies', () => ({
  getCompany: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/api/calendar', async () => {
  const actual = await vi.importActual('@/lib/api/calendar');
  return {
    ...(actual as object),
    createCalendarEvent: (...args: unknown[]) => createMock(...args),
    updateCalendarEvent: (...args: unknown[]) => updateMock(...args),
    deleteCalendarEvent: (...args: unknown[]) => deleteMock(...args),
  };
});

function renderWithProviders(node: JSX.Element): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('CalendarEventDialog', () => {
  beforeEach(() => {
    createMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
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

  afterEach(() => {
    useAuthStore.getState().clear();
    vi.clearAllMocks();
  });

  it('renderiza el formulario en modo creación', async () => {
    await act(async () => {
      renderWithProviders(<CalendarEventDialog open onClose={vi.fn()} mode="create" />);
    });

    expect(screen.getByRole('heading', { name: /nuevo evento/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/título/i)).toHaveValue('');
    expect(screen.getByLabelText(/inicio/i)).toBeInTheDocument();
  });

  it('muestra error de validación cuando fin es anterior al inicio', async () => {
    await act(async () => {
      renderWithProviders(<CalendarEventDialog open onClose={vi.fn()} mode="create" />);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'Reunión' } });
      fireEvent.change(screen.getByLabelText(/inicio/i), { target: { value: '2026-05-10T11:00' } });
      fireEvent.change(screen.getByLabelText(/fin/i), { target: { value: '2026-05-10T10:00' } });
      fireEvent.click(screen.getByRole('button', { name: /crear evento/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/la fecha de fin debe ser posterior al inicio/i)).toBeInTheDocument();
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('crea un evento válido', async () => {
    createMock.mockResolvedValue({
      id: 'event_1',
      ownerId: 'user_1',
      createdById: 'user_1',
      title: 'Demo',
      description: null,
      location: null,
      startsAt: new Date('2026-05-10T09:30').toISOString(),
      endsAt: new Date('2026-05-10T10:15').toISOString(),
      allDay: false,
      visibility: 'personal',
      relatedEntityType: null,
      relatedEntityId: null,
      color: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await act(async () => {
      renderWithProviders(<CalendarEventDialog open onClose={vi.fn()} mode="create" />);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'Demo' } });
      fireEvent.change(screen.getByLabelText(/inicio/i), { target: { value: '2026-05-10T09:30' } });
      fireEvent.change(screen.getByLabelText(/fin/i), { target: { value: '2026-05-10T10:15' } });
      fireEvent.click(screen.getByRole('button', { name: /crear evento/i }));
    });

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith({
        title: 'Demo',
        description: undefined,
        location: undefined,
        startsAt: new Date('2026-05-10T09:30').toISOString(),
        endsAt: new Date('2026-05-10T10:15').toISOString(),
        allDay: false,
        visibility: 'personal',
        relatedEntityType: undefined,
        relatedEntityId: undefined,
        color: undefined,
      });
    });
  });

  it('pre-rellena datos en modo edición', async () => {
    await act(async () => {
      renderWithProviders(
        <CalendarEventDialog
          open
          onClose={vi.fn()}
          mode="edit"
          event={{
            id: 'event_1',
            ownerId: 'user_1',
            createdById: 'user_1',
            title: 'Kickoff',
            description: 'Preparar agenda',
            location: 'Madrid',
            startsAt: '2026-05-12T08:00:00.000Z',
            endsAt: '2026-05-12T09:00:00.000Z',
            allDay: false,
            visibility: 'general',
            relatedEntityType: null,
            relatedEntityId: null,
            color: '#123456',
            createdAt: '2026-05-01T08:00:00.000Z',
            updatedAt: '2026-05-01T08:00:00.000Z',
          }}
        />,
      );
    });

    expect(screen.getByLabelText(/título/i)).toHaveValue('Kickoff');
    expect(screen.getByLabelText(/descripción/i)).toHaveValue('Preparar agenda');
    expect(screen.getByLabelText(/ubicación/i)).toHaveValue('Madrid');
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument();
  });

  it('permite cambiar la visibilidad a general', async () => {
    createMock.mockResolvedValue({
      id: 'event_2',
      ownerId: 'user_1',
      createdById: 'user_1',
      title: 'All hands',
      description: null,
      location: null,
      startsAt: new Date('2026-05-11T12:00').toISOString(),
      endsAt: new Date('2026-05-11T13:00').toISOString(),
      allDay: false,
      visibility: 'general',
      relatedEntityType: null,
      relatedEntityId: null,
      color: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await act(async () => {
      renderWithProviders(<CalendarEventDialog open onClose={vi.fn()} mode="create" />);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'All hands' } });
      fireEvent.click(screen.getByLabelText(/general/i));
      fireEvent.change(screen.getByLabelText(/inicio/i), { target: { value: '2026-05-11T12:00' } });
      fireEvent.change(screen.getByLabelText(/fin/i), { target: { value: '2026-05-11T13:00' } });
      fireEvent.click(screen.getByRole('button', { name: /crear evento/i }));
    });

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: 'general',
        }),
      );
    });
  });
});

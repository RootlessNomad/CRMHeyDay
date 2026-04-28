/// <reference types="@testing-library/jest-dom" />
import { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityFormDialog } from './ActivityFormDialog';

const createActivityMock = vi.fn();
const updateActivityMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/api/activities', async () => {
  const actual = await vi.importActual('@/lib/api/activities');
  return {
    ...(actual as object),
    createActivity: (...args: unknown[]) => createActivityMock(...args),
    updateActivity: (...args: unknown[]) => updateActivityMock(...args),
  };
});

describe('ActivityFormDialog', () => {
  beforeEach(() => {
    createActivityMock.mockReset();
    updateActivityMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('create válido llama createActivity con payload sanitizado', async () => {
    const onSuccess = vi.fn();
    createActivityMock.mockResolvedValue({ id: 'activity_1' });

    render(
      <ActivityFormDialog
        open
        onClose={vi.fn()}
        mode="create"
        entityType="lead"
        entityId="lead_1"
        onSuccess={onSuccess}
      />,
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/tipo/i), { target: { value: 'task' } });
      fireEvent.change(screen.getByLabelText(/título/i), { target: { value: ' Follow up ' } });
      fireEvent.change(screen.getByLabelText(/contenido/i), {
        target: { value: ' Llamar mañana ' },
      });
      fireEvent.change(screen.getByLabelText(/vence/i), { target: { value: '2026-04-30T10:15' } });
      fireEvent.click(screen.getByRole('button', { name: /crear actividad/i }));
    });

    await waitFor(() => {
      expect(createActivityMock).toHaveBeenCalledWith({
        entity_type: 'lead',
        entity_id: 'lead_1',
        kind: 'task',
        title: 'Follow up',
        body: 'Llamar mañana',
        due_at: new Date('2026-04-30T10:15').toISOString(),
        remind_at: null,
      });
    });
    expect(onSuccess).toHaveBeenCalledWith({ id: 'activity_1' });
  });

  it('mode edit hidrata valores correctamente', () => {
    render(
      <ActivityFormDialog
        open
        onClose={vi.fn()}
        mode="edit"
        entityType="contact"
        entityId="contact_1"
        activity={{
          id: 'activity_1',
          entity_type: 'contact',
          entity_id: 'contact_1',
          kind: 'meeting_log',
          title: 'Reunión semanal',
          body: 'Notas',
          owner_id: 'user_1',
          due_at: '2026-04-29T09:30:00.000Z',
          completed_at: null,
          remind_at: '2026-04-29T08:30:00.000Z',
          created_by_id: 'user_1',
          created_at: '2026-04-28T09:00:00.000Z',
          updated_at: '2026-04-28T09:00:00.000Z',
        }}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/tipo/i)).toHaveValue('meeting_log');
    expect(screen.getByLabelText(/título/i)).toHaveValue('Reunión semanal');
    expect(screen.getByLabelText(/contenido/i)).toHaveValue('Notas');
    expect(screen.getByLabelText(/vence/i)).toHaveValue('2026-04-29T09:30');
    expect(screen.getByLabelText(/recordatorio/i)).toHaveValue('2026-04-29T08:30');
  });

  it('validación bloquea submit sin kind', async () => {
    render(
      <ActivityFormDialog
        open
        onClose={vi.fn()}
        mode="create"
        entityType="company"
        entityId="company_1"
        onSuccess={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear actividad/i }));
    });

    expect(await screen.findByText(/requerido/i)).toBeInTheDocument();
    expect(createActivityMock).not.toHaveBeenCalled();
  });
});

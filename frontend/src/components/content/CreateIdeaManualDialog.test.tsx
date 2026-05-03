/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateIdeaManualDialog } from './CreateIdeaManualDialog';

const createIdeaManualMock = vi.fn();
const getPillarsMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api/content', async () => {
  const actual = await vi.importActual('@/lib/api/content');
  return {
    ...(actual as object),
    createIdeaManual: (...args: unknown[]) => createIdeaManualMock(...args),
    getPillars: (...args: unknown[]) => getPillarsMock(...args),
  };
});

function renderWithProviders(node: JSX.Element): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('CreateIdeaManualDialog', () => {
  beforeEach(() => {
    createIdeaManualMock.mockReset();
    getPillarsMock.mockReset();
    toastSuccessMock.mockReset();
    getPillarsMock.mockResolvedValue([
      {
        id: 'pillar_1',
        key: 'education',
        label_es: 'Educación',
        description_es: 'desc',
        is_active: true,
      },
    ]);
  });

  it('submit llama createIdeaManual con los datos del form y luego cierra el dialog', async () => {
    const onClose = vi.fn();
    createIdeaManualMock.mockResolvedValue({ id: 'idea_1' });

    renderWithProviders(<CreateIdeaManualDialog open onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Nueva idea' },
    });
    fireEvent.change(screen.getByLabelText('Ángulo'), {
      target: { value: 'Educar sobre recuperación' },
    });
    fireEvent.change(await screen.findByLabelText('Pilar'), {
      target: { value: 'pillar_1' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Brief/ }), {
      target: { value: 'Brief válido' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear idea' }));

    await waitFor(() => {
      expect(createIdeaManualMock).toHaveBeenCalledWith({
        title: 'Nueva idea',
        angle: 'Educar sobre recuperación',
        pillar_id: 'pillar_1',
        brief_es: 'Brief válido',
        icp_vertical: undefined,
      });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

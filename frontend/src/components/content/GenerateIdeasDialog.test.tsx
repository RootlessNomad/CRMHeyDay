/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/client';

import { GenerateIdeasDialog } from './GenerateIdeasDialog';

const generateIdeasMock = vi.fn();
const getPillarsMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/api/content', async () => {
  const actual = await vi.importActual('@/lib/api/content');
  return {
    ...(actual as object),
    generateIdeas: (...args: unknown[]) => generateIdeasMock(...args),
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

describe('GenerateIdeasDialog', () => {
  beforeEach(() => {
    generateIdeasMock.mockReset();
    getPillarsMock.mockReset();
    toastErrorMock.mockReset();
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submit válido llama generateIdeas y después onJobCreated', async () => {
    const onJobCreated = vi.fn();
    generateIdeasMock.mockResolvedValue({ job_id: 'job_1' });

    renderWithProviders(<GenerateIdeasDialog open onClose={vi.fn()} onJobCreated={onJobCreated} />);

    fireEvent.change(await screen.findByLabelText('Pilar'), {
      target: { value: 'pillar_1' },
    });
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Ideas sobre prevención y movilidad' },
    });
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar ideas' }));

    await waitFor(() => {
      expect(generateIdeasMock).toHaveBeenCalledWith({
        generate: true,
        pillar_id: 'pillar_1',
        brief_es: 'Ideas sobre prevención y movilidad',
        icp_vertical: undefined,
        count: 6,
      });
    });
    expect(onJobCreated).toHaveBeenCalledWith('job_1');
  });

  it('si backend devuelve CONTENT_DAILY_LIMIT muestra toast de límite diario', async () => {
    generateIdeasMock.mockRejectedValue(
      new ApiError(429, {
        code: 'CONTENT_DAILY_LIMIT',
        message: 'limit',
      }),
    );

    renderWithProviders(<GenerateIdeasDialog open onClose={vi.fn()} onJobCreated={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('Pilar'), {
      target: { value: 'pillar_1' },
    });
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Ideas sobre prevención y movilidad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generar ideas' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Has alcanzado el límite diario de generaciones. Inténtalo mañana.',
      );
    });
  });
});

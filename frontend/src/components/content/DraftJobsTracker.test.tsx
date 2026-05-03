/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftJobsTracker } from './DraftJobsTracker';

const getJobMock = vi.fn();

vi.mock('@/lib/api/jobs', async () => {
  const actual = await vi.importActual('@/lib/api/jobs');
  return {
    ...(actual as object),
    getJob: (...args: unknown[]) => getJobMock(...args),
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

describe('DraftJobsTracker', () => {
  beforeEach(() => {
    getJobMock.mockReset();
  });

  it('cuando todos los jobs terminan llama onAllComplete con itemIds[0]', async () => {
    const onAllComplete = vi.fn();
    getJobMock.mockResolvedValue({
      id: 'job',
      queue: 'content',
      status: 'succeeded',
      error: null,
      started_at: null,
      finished_at: null,
      created_at: '2026-05-03T10:00:00.000Z',
      result: null,
      payload: null,
    });

    renderWithProviders(
      <DraftJobsTracker
        jobIds={['job_1', 'job_2']}
        itemIds={['item_1', 'item_2']}
        onAllComplete={onAllComplete}
      />,
    );

    await waitFor(() => {
      expect(onAllComplete).toHaveBeenCalledWith('item_1');
    });
  });

  it("un job con status 'failed' muestra estado de error", async () => {
    getJobMock
      .mockResolvedValueOnce({
        id: 'job_1',
        queue: 'content',
        status: 'failed',
        error: 'Fallo del modelo',
        started_at: null,
        finished_at: null,
        created_at: '2026-05-03T10:00:00.000Z',
        result: null,
        payload: null,
      })
      .mockResolvedValueOnce({
        id: 'job_2',
        queue: 'content',
        status: 'running',
        error: null,
        started_at: null,
        finished_at: null,
        created_at: '2026-05-03T10:00:00.000Z',
        result: null,
        payload: null,
      });

    renderWithProviders(
      <DraftJobsTracker
        jobIds={['job_1', 'job_2']}
        itemIds={['item_1', 'item_2']}
        onAllComplete={vi.fn()}
      />,
    );

    expect(await screen.findByText('Fallido')).toBeInTheDocument();
    expect(screen.getByText('Fallo del modelo')).toBeInTheDocument();
  });
});

/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdeaJobTracker } from './IdeaJobTracker';

const useQueryMock = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

describe('IdeaJobTracker', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it("detiene el polling cuando el status es 'succeeded'", () => {
    let refetchValue: number | false | undefined;

    useQueryMock.mockImplementation(
      (options: {
        refetchInterval?: (query: { state: { data?: { status: string } } }) => number | false;
      }) => {
        refetchValue = options.refetchInterval?.({
          state: {
            data: {
              status: 'succeeded',
            },
          },
        });

        return {
          isLoading: false,
          isError: false,
          data: {
            id: 'job_1',
            queue: 'content',
            status: 'succeeded',
            error: null,
            started_at: null,
            finished_at: null,
            created_at: '2026-05-03T10:00:00.000Z',
            result: { count: 5 },
            payload: null,
          },
        };
      },
    );

    render(<IdeaJobTracker jobId="job_1" onComplete={vi.fn()} />);

    expect(refetchValue).toBe(false);
    expect(screen.getByText('5 ideas creadas')).toBeInTheDocument();
  });

  it('llama onComplete exactamente una vez cuando el job pasa a succeeded', async () => {
    const onComplete = vi.fn();

    useQueryMock
      .mockReturnValueOnce({
        isLoading: false,
        isError: false,
        data: {
          id: 'job_1',
          queue: 'content',
          status: 'running',
          error: null,
          started_at: null,
          finished_at: null,
          created_at: '2026-05-03T10:00:00.000Z',
          result: null,
          payload: null,
        },
      })
      .mockReturnValueOnce({
        isLoading: false,
        isError: false,
        data: {
          id: 'job_1',
          queue: 'content',
          status: 'succeeded',
          error: null,
          started_at: null,
          finished_at: null,
          created_at: '2026-05-03T10:00:00.000Z',
          result: { count: 3 },
          payload: null,
        },
      })
      .mockReturnValue({
        isLoading: false,
        isError: false,
        data: {
          id: 'job_1',
          queue: 'content',
          status: 'succeeded',
          error: null,
          started_at: null,
          finished_at: null,
          created_at: '2026-05-03T10:00:00.000Z',
          result: { count: 3 },
          payload: null,
        },
      });

    const { rerender } = render(<IdeaJobTracker jobId="job_1" onComplete={onComplete} />);

    expect(screen.getByText('Generando ideas...')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    rerender(<IdeaJobTracker jobId="job_1" onComplete={onComplete} />);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    rerender(<IdeaJobTracker jobId="job_1" onComplete={onComplete} />);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

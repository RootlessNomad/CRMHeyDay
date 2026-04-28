import { afterEach, describe, expect, it, vi } from 'vitest';

import { listPipelines } from './pipelines';

const apiFetchMock = vi.fn();

vi.mock('./client', async () => {
  const actual = await vi.importActual('./client');
  return {
    ...(actual as object),
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  };
});

describe('pipelines api', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it('listPipelines carga el listado', async () => {
    const response = [
      {
        id: 'pipe_1',
        name: 'Ventas',
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stages: [],
      },
    ];
    apiFetchMock.mockResolvedValue(response);

    await expect(listPipelines()).resolves.toEqual(response);
    expect(apiFetchMock).toHaveBeenCalledWith('/pipelines');
  });
});

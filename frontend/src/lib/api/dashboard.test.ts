import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardMetrics, getTopPriorityLeads, getUpcomingActions } from './dashboard';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('./client', () => ({ apiFetch: apiFetchMock }));

describe('dashboard api', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('getDashboardMetrics llama al endpoint de métricas', async () => {
    apiFetchMock.mockResolvedValue({});

    await getDashboardMetrics();

    expect(apiFetchMock).toHaveBeenCalledWith('/dashboard/metrics');
  });

  it('getUpcomingActions llama al endpoint de próximas acciones', async () => {
    apiFetchMock.mockResolvedValue([]);

    await getUpcomingActions();

    expect(apiFetchMock).toHaveBeenCalledWith('/dashboard/upcoming-actions');
  });

  it('getTopPriorityLeads llama al endpoint de leads prioritarios', async () => {
    apiFetchMock.mockResolvedValue([]);

    await getTopPriorityLeads();

    expect(apiFetchMock).toHaveBeenCalledWith('/dashboard/top-priority-leads');
  });
});

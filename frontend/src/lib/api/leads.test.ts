import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLead, deleteLead, listLeads, markLostLead } from './leads';

const apiFetchMock = vi.fn();

vi.mock('./client', async () => {
  const actual = await vi.importActual('./client');
  return {
    ...(actual as object),
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  };
});

describe('leads api', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it('listLeads serializa query params correctamente', async () => {
    apiFetchMock.mockResolvedValue({ items: [], page: 2, pageSize: 20, total: 0 });

    await listLeads({ q: 'foo', page: 2 });

    expect(apiFetchMock).toHaveBeenCalledWith('/leads?q=foo&page=2');
  });

  it('markLostLead envía el body JSON correcto', async () => {
    apiFetchMock.mockResolvedValue({ id: 'lead_1' });

    await markLostLead('lead_1', 'Sin presupuesto');

    expect(apiFetchMock).toHaveBeenCalledWith('/leads/lead_1/lost', {
      method: 'POST',
      json: { lostReason: 'Sin presupuesto' },
    });
  });

  it('deleteLead maneja 204 y devuelve void', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await expect(deleteLead('lead_1')).resolves.toBeUndefined();
    expect(apiFetchMock).toHaveBeenCalledWith('/leads/lead_1', { method: 'DELETE' });
  });

  it('createLead hace POST en el happy path', async () => {
    const response = {
      id: 'lead_1',
      companyId: 'company_1',
      primaryContactId: null,
      pipelineId: 'pipeline_1',
      stageId: 'stage_1',
      ownerId: 'user_1',
      source: 'manual',
      status: 'open',
      priorityScore: 42,
      priorityManual: 42,
      nextActionAt: null,
      lostReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    apiFetchMock.mockResolvedValue(response);

    await expect(
      createLead({
        companyId: 'company_1',
        pipelineId: 'pipeline_1',
        stageId: 'stage_1',
        ownerId: 'user_1',
        source: 'manual',
        priorityManual: 42,
      }),
    ).resolves.toEqual(response);

    expect(apiFetchMock).toHaveBeenCalledWith('/leads', {
      method: 'POST',
      json: {
        companyId: 'company_1',
        pipelineId: 'pipeline_1',
        stageId: 'stage_1',
        ownerId: 'user_1',
        source: 'manual',
        priorityManual: 42,
      },
    });
  });
});

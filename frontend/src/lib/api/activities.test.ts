import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createActivity,
  deleteActivity,
  getActivity,
  listActivities,
  updateActivity,
} from './activities';

const apiFetchMock = vi.fn();

vi.mock('./client', async () => {
  const actual = await vi.importActual('./client');
  return {
    ...(actual as object),
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  };
});

describe('activities api', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it('listActivities serializa filtros omitiendo vacíos', async () => {
    apiFetchMock.mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 20 });

    await listActivities({
      entity_type: 'lead',
      entity_id: 'lead_1',
      kind: 'task',
      owner_id: '',
      completed: false,
      page: 2,
      page_size: 20,
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/activities?entity_type=lead&entity_id=lead_1&kind=task&completed=false&page=2&page_size=20',
    );
  });

  it('getActivity usa la URL correcta', async () => {
    apiFetchMock.mockResolvedValue({ id: 'activity_1' });

    await getActivity('activity_1');

    expect(apiFetchMock).toHaveBeenCalledWith('/activities/activity_1');
  });

  it('createActivity envía POST con json', async () => {
    apiFetchMock.mockResolvedValue({ id: 'activity_1' });

    await createActivity({
      entity_type: 'contact',
      entity_id: 'contact_1',
      kind: 'note',
      title: 'Seguimiento',
    });

    expect(apiFetchMock).toHaveBeenCalledWith('/activities', {
      method: 'POST',
      json: {
        entity_type: 'contact',
        entity_id: 'contact_1',
        kind: 'note',
        title: 'Seguimiento',
      },
    });
  });

  it('updateActivity usa PATCH con el patch recibido', async () => {
    apiFetchMock.mockResolvedValue({ id: 'activity_1' });

    await updateActivity('activity_1', { completed_at: null });

    expect(apiFetchMock).toHaveBeenCalledWith('/activities/activity_1', {
      method: 'PATCH',
      json: { completed_at: null },
    });
  });

  it('deleteActivity usa method DELETE', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await expect(deleteActivity('activity_1')).resolves.toBeUndefined();
    expect(apiFetchMock).toHaveBeenCalledWith('/activities/activity_1', { method: 'DELETE' });
  });
});

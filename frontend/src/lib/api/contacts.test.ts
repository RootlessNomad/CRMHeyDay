import { afterEach, describe, expect, it, vi } from 'vitest';

import { anonymizeContact, createContact, deleteContact, listContacts } from './contacts';

const apiFetchMock = vi.fn();

vi.mock('./client', async () => {
  const actual = await vi.importActual('./client');
  return {
    ...(actual as object),
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  };
});

describe('contacts api', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it('listContacts serializa filtros omitiendo vacíos', async () => {
    apiFetchMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    await listContacts({
      q: 'alex',
      company_id: '',
      is_primary: true,
      page: 2,
      pageSize: 20,
      sort: 'updated_at_desc',
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/contacts?q=alex&is_primary=true&page=2&pageSize=20&sort=updated_at_desc',
    );
  });

  it('createContact envía POST con json', async () => {
    apiFetchMock.mockResolvedValue({ id: 'contact_1' });

    await createContact({ first_name: 'Alex', email: 'alex@heyday.test' });

    expect(apiFetchMock).toHaveBeenCalledWith('/contacts', {
      method: 'POST',
      json: { first_name: 'Alex', email: 'alex@heyday.test' },
    });
  });

  it('anonymizeContact hace POST a la URL correcta', async () => {
    apiFetchMock.mockResolvedValue({ id: 'contact_1' });

    await anonymizeContact('contact_1');

    expect(apiFetchMock).toHaveBeenCalledWith('/contacts/contact_1/anonymize', {
      method: 'POST',
    });
  });

  it('deleteContact usa method DELETE', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await expect(deleteContact('contact_1')).resolves.toBeUndefined();
    expect(apiFetchMock).toHaveBeenCalledWith('/contacts/contact_1', { method: 'DELETE' });
  });
});

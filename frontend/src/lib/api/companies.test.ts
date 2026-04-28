import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CompanyDto } from '@/types/company';

import { ApiError } from './client';
import { createCompany, deleteCompany, isCompanyDomainConflict, listCompanies } from './companies';

const apiFetchMock = vi.fn();

vi.mock('./client', async () => {
  const actual = await vi.importActual('./client');
  return {
    ...(actual as object),
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  };
});

describe('companies api', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    vi.restoreAllMocks();
  });

  it('listCompanies serializa filtros omitiendo vacíos', async () => {
    apiFetchMock.mockResolvedValue({ items: [], page: 2, pageSize: 20, total: 0 });

    await listCompanies({
      q: 'heyday',
      icp_vertical: 'cafe',
      city: '',
      page: 2,
      pageSize: 20,
      sort: 'updated_at_desc',
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/companies?q=heyday&icp_vertical=cafe&page=2&pageSize=20&sort=updated_at_desc',
    );
  });

  it('createCompany envía POST con body JSON', async () => {
    const dto = { id: 'cmp_1', name: 'HeyDay' } as CompanyDto;
    apiFetchMock.mockResolvedValue(dto);

    await createCompany({ name: 'HeyDay', country: 'ES', domain: 'heyday.test' });

    expect(apiFetchMock).toHaveBeenCalledWith('/companies', {
      method: 'POST',
      json: { name: 'HeyDay', country: 'ES', domain: 'heyday.test' },
    });
  });

  it('deleteCompany resuelve undefined para 204', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await expect(deleteCompany('cmp_1')).resolves.toBeUndefined();
    expect(apiFetchMock).toHaveBeenCalledWith('/companies/cmp_1', { method: 'DELETE' });
  });

  it('409 mantiene ApiError y helper detecta conflicto de dominio', () => {
    const error = new ApiError(409, {
      code: 'COMPANY_DOMAIN_CONFLICT',
      message: 'duplicado',
      details: { existing_id: 'cmp_existing' },
    });

    expect(isCompanyDomainConflict(error)).toBe(true);
    if (!isCompanyDomainConflict(error)) {
      throw new Error('helper no detectó el conflicto');
    }
    expect(error.details.existing_id).toBe('cmp_existing');
  });
});

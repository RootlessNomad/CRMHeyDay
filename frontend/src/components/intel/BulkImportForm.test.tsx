/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BulkImportForm } from './BulkImportForm';

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
const getAccessTokenMock = vi.fn<() => string | null>(() => null);

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock('@/lib/auth/store', () => ({
  getAccessToken: () => getAccessTokenMock(),
}));

describe('BulkImportForm', () => {
  beforeEach(() => {
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    getAccessTokenMock.mockReset();
    getAccessTokenMock.mockReturnValue(null);
    vi.restoreAllMocks();
  });

  it('renderiza input, botón y link de plantilla', () => {
    render(<BulkImportForm onBatchCreated={vi.fn()} />);

    expect(screen.getByLabelText('Archivo CSV')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar CSV' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descargar plantilla' })).toBeInTheDocument();
  });

  it('envía el archivo por fetch y notifica los run ids creados', async () => {
    const onBatchCreated = vi.fn();
    getAccessTokenMock.mockReturnValue('token_123');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        batch_id: 'batch_1',
        count: 2,
        run_ids: ['run_1', 'run_2'],
        errors: [],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<BulkImportForm onBatchCreated={onBatchCreated} />);

    fireEvent.change(screen.getByLabelText('Archivo CSV'), {
      target: {
        files: [
          new File(['name,website\nAcme,https://acme.test'], 'leads.csv', { type: 'text/csv' }),
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Importar CSV' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/intel/bulk-import');
    expect(options).toEqual(
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: 'Bearer token_123' },
        body: expect.any(FormData),
      }),
    );

    const body = options.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBeInstanceOf(File);

    expect(onBatchCreated).toHaveBeenCalledWith(['run_1', 'run_2']);
    expect(toastSuccessMock).toHaveBeenCalledWith('2 empresas en cola');
  });
});

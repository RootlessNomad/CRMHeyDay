/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/client';

import { CompanyFormDialog } from './CompanyFormDialog';

const createCompanyMock = vi.fn();
const updateCompanyMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/api/companies', async () => {
  const actual = await vi.importActual('@/lib/api/companies');
  return {
    ...(actual as object),
    createCompany: (...args: unknown[]) => createCompanyMock(...args),
    updateCompany: (...args: unknown[]) => updateCompanyMock(...args),
  };
});

describe('CompanyFormDialog', () => {
  beforeEach(() => {
    createCompanyMock.mockReset();
    updateCompanyMock.mockReset();
    toastErrorMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza modo create con campos base visibles y colapsables ocultos', () => {
    render(<CompanyFormDialog open onClose={vi.fn()} mode="create" onSuccess={vi.fn()} />);

    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/whatsapp/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /más datos/i })).toBeInTheDocument();
  });

  it('muestra error requerido si name está vacío', async () => {
    render(<CompanyFormDialog open onClose={vi.fn()} mode="create" onSuccess={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /crear empresa/i }));

    expect(await screen.findByText(/requerido/i)).toBeInTheDocument();
    expect(createCompanyMock).not.toHaveBeenCalled();
  });

  it('si createCompany devuelve 409 muestra el toast esperado y no cierra', async () => {
    createCompanyMock.mockRejectedValue(
      new ApiError(409, {
        code: 'COMPANY_DOMAIN_CONFLICT',
        message: 'duplicado',
        details: { existing_id: 'cmp_9' },
      }),
    );

    render(<CompanyFormDialog open onClose={vi.fn()} mode="create" onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText(/dominio/i), { target: { value: 'acme.test' } });
    fireEvent.click(screen.getByRole('button', { name: /crear empresa/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Ya existe una empresa con ese dominio.',
        expect.any(Object),
      );
    });
  });

  it('submit válido llama createCompany con payload sanitizado y onSuccess', async () => {
    const onSuccess = vi.fn();
    createCompanyMock.mockResolvedValue({ id: 'cmp_1', name: 'Acme' });

    render(<CompanyFormDialog open onClose={vi.fn()} mode="create" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: ' Acme ' } });
    fireEvent.change(screen.getByLabelText(/país/i), { target: { value: 'es' } });
    fireEvent.change(screen.getByLabelText(/ciudad/i), { target: { value: 'Madrid' } });
    fireEvent.click(screen.getByRole('button', { name: /crear empresa/i }));

    await waitFor(() => {
      expect(createCompanyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Acme',
          country: 'ES',
          city: 'Madrid',
          website: null,
          domain: null,
        }),
      );
    });
    expect(onSuccess).toHaveBeenCalledWith({ id: 'cmp_1', name: 'Acme' });
  });
});

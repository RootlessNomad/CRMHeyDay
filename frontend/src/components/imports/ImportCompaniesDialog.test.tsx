/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/client';

import { ImportCompaniesDialog } from './ImportCompaniesDialog';

const { importCompaniesCsvMock, isImportCapErrorMock, isImportHeaderErrorMock, toastSuccessMock } =
  vi.hoisted(() => ({
    importCompaniesCsvMock: vi.fn(),
    isImportCapErrorMock: vi.fn(() => false),
    isImportHeaderErrorMock: vi.fn(() => false),
    toastSuccessMock: vi.fn(),
  }));

vi.mock('../../lib/api/imports', () => ({
  importCompaniesCsv: importCompaniesCsvMock,
  isImportCapError: isImportCapErrorMock,
  isImportHeaderError: isImportHeaderErrorMock,
}));

vi.mock('sonner', () => ({ toast: { success: toastSuccessMock, error: vi.fn() } }));

describe('ImportCompaniesDialog', () => {
  beforeEach(() => {
    importCompaniesCsvMock.mockReset();
    isImportCapErrorMock.mockReset();
    isImportCapErrorMock.mockReturnValue(false);
    isImportHeaderErrorMock.mockReset();
    isImportHeaderErrorMock.mockReturnValue(false);
    toastSuccessMock.mockReset();
  });

  it('renderiza upload con Validar deshabilitado si no hay archivo', () => {
    render(<ImportCompaniesDialog open onClose={vi.fn()} onImported={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Validar' })).toBeDisabled();
  });

  it('valida en cliente archivos de más de 2 MB y no llama al API', async () => {
    render(<ImportCompaniesDialog open onClose={vi.fn()} onImported={vi.fn()} />);

    const input = screen.getByLabelText(/archivo csv/i);
    const file = new File(['x'], 'companies.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 + 1 });

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('El archivo no puede superar 2 MB')).toBeInTheDocument();
    expect(importCompaniesCsvMock).not.toHaveBeenCalled();
  });

  it('hace dry-run y avanza a preview con los contadores correctos', async () => {
    importCompaniesCsvMock.mockResolvedValue({
      rows_total: 3,
      rows_created: 3,
      rows_skipped_duplicate: 0,
      rows_failed: 0,
      errors: [],
      dry_run: true,
    });

    render(<ImportCompaniesDialog open onClose={vi.fn()} onImported={vi.fn()} />);

    const input = screen.getByLabelText(/archivo csv/i);
    fireEvent.change(input, {
      target: { files: [new File(['name\nAcme'], 'companies.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('A crear')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getAllByText('3', { selector: 'p' }).length).toBeGreaterThanOrEqual(1);
    expect(importCompaniesCsvMock).toHaveBeenCalledWith(expect.any(File), true);
  });

  it('submit real OK avanza a result y llama onImported', async () => {
    const onImported = vi.fn();
    importCompaniesCsvMock
      .mockResolvedValueOnce({
        rows_total: 2,
        rows_created: 2,
        rows_skipped_duplicate: 0,
        rows_failed: 0,
        errors: [],
        dry_run: true,
      })
      .mockResolvedValueOnce({
        rows_total: 2,
        rows_created: 2,
        rows_skipped_duplicate: 0,
        rows_failed: 0,
        errors: [],
        dry_run: false,
      });

    render(<ImportCompaniesDialog open onClose={vi.fn()} onImported={onImported} />);

    fireEvent.change(screen.getByLabelText(/archivo csv/i), {
      target: { files: [new File(['name\nAcme'], 'companies.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await screen.findByRole('button', { name: 'Importar 2 empresas' });

    fireEvent.click(screen.getByRole('button', { name: 'Importar 2 empresas' }));

    await waitFor(() => {
      expect(onImported).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Importación completada: 2 empresa(s) creada(s).',
    );
  });

  it('muestra error inline si falla el dry-run y no avanza a preview', async () => {
    importCompaniesCsvMock.mockRejectedValue(
      new ApiError(400, { code: 'VALIDATION_ERROR', message: 'CSV inválido' }),
    );

    render(<ImportCompaniesDialog open onClose={vi.fn()} onImported={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/archivo csv/i), {
      target: { files: [new File(['name\nAcme'], 'companies.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByText('CSV inválido')).toBeInTheDocument();
    expect(screen.queryByText('A crear')).not.toBeInTheDocument();
  });

  it('deshabilita Importar N empresas si rows_created es 0', async () => {
    importCompaniesCsvMock.mockResolvedValue({
      rows_total: 2,
      rows_created: 0,
      rows_skipped_duplicate: 2,
      rows_failed: 0,
      errors: [],
      dry_run: true,
    });

    render(<ImportCompaniesDialog open onClose={vi.fn()} onImported={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/archivo csv/i), {
      target: { files: [new File(['name\nAcme'], 'companies.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));

    expect(await screen.findByRole('button', { name: 'Importar 0 empresas' })).toBeDisabled();
  });
});

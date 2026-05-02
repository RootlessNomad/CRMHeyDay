/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StartResearchForm } from './StartResearchForm';

const createEnrichmentRunMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock('@/lib/api/intel', () => ({
  createEnrichmentRun: (...args: unknown[]) => createEnrichmentRunMock(...args),
}));

describe('StartResearchForm', () => {
  beforeEach(() => {
    createEnrichmentRunMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it('renderiza input y botón; si está vacío muestra error y no llama API', async () => {
    render(<StartResearchForm onRunCreated={vi.fn()} />);

    expect(screen.getByLabelText('URL de la empresa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Investigar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Investigar' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Pega una URL para iniciar la investigación.');
    });
    expect(createEnrichmentRunMock).not.toHaveBeenCalled();
    expect(screen.getByText('Pega una URL para iniciar la investigación.')).toBeInTheDocument();
  });

  it('con URL válida crea la investigación y llama onRunCreated con los ids', async () => {
    const onRunCreated = vi.fn();
    createEnrichmentRunMock.mockResolvedValue({
      job_id: 'job_1',
      run_id: 'run_1',
      company_id: 'cmp_1',
      status: 'queued',
    });

    render(<StartResearchForm onRunCreated={onRunCreated} />);

    fireEvent.change(screen.getByLabelText('URL de la empresa'), {
      target: { value: 'https://cafe-ejemplo.es' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Investigar' }));

    await waitFor(() => {
      expect(createEnrichmentRunMock).toHaveBeenCalledWith({
        input_url: 'https://cafe-ejemplo.es',
      });
    });
    expect(onRunCreated).toHaveBeenCalledWith('run_1', 'cmp_1');
    expect(toastSuccessMock).toHaveBeenCalledWith('Investigación iniciada');
  });
});

/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PainPointsTable } from './PainPointsTable';

const listPainPointsMock = vi.fn();
const updatePainPointMock = vi.fn();
const deletePainPointMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/lib/api/intel', () => ({
  listPainPoints: (...args: unknown[]) => listPainPointsMock(...args),
  updatePainPoint: (...args: unknown[]) => updatePainPointMock(...args),
  deletePainPoint: (...args: unknown[]) => deletePainPointMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function renderTable(): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={client}>
      <PainPointsTable />
    </QueryClientProvider>,
  );
}

describe('PainPointsTable', () => {
  afterEach(() => {
    listPainPointsMock.mockReset();
    updatePainPointMock.mockReset();
    deletePainPointMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it('renderiza estado vacío cuando no hay pain points', async () => {
    listPainPointsMock.mockResolvedValue({ data: [], total: 0 });

    renderTable();

    await waitFor(() => {
      expect(
        screen.getByText(
          'No hay pain points. Lanza una investigación para detectarlos automáticamente.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('renderiza una fila con badge de confidence', async () => {
    listPainPointsMock.mockResolvedValue({
      data: [
        {
          id: 'pp_1',
          company_id: 'cmp_1',
          company_name: 'HeyDay Coffee',
          category_id: 'cat_1',
          category_key: 'cash_flow',
          category_label_es: 'Flujo de caja',
          confidence: 'observed',
          evidence_text: 'La empresa menciona retrasos de cobro y tension de tesoreria.',
          evidence_source_url: 'https://example.com/source',
          evidence_timestamp: '2026-05-01T10:00:00.000Z',
          detected_by: 'claude',
          human_verified: false,
          verified_by_id: null,
          created_at: '2026-05-01T10:00:00.000Z',
          updated_at: '2026-05-01T10:00:00.000Z',
        },
      ],
      total: 1,
    });

    renderTable();

    await waitFor(() => {
      expect(screen.getByText('HeyDay Coffee')).toBeInTheDocument();
    });

    const row = screen.getByText('HeyDay Coffee').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLTableRowElement).getByText('Observado')).toHaveClass(
      'bg-blue-50',
      'text-blue-700',
    );
    expect(within(row as HTMLTableRowElement).getByText('Flujo de caja')).toBeInTheDocument();
  });
});

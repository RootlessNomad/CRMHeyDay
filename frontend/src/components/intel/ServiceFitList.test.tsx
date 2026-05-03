/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceFitList } from './ServiceFitList';

const listServiceFitMock = vi.fn();
const regenerateServiceFitMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/lib/api/intel', () => ({
  listServiceFit: (...args: unknown[]) => listServiceFitMock(...args),
  regenerateServiceFit: (...args: unknown[]) => regenerateServiceFitMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function renderList(): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={client}>
      <ServiceFitList companyId="company_1" />
    </QueryClientProvider>,
  );
}

describe('ServiceFitList', () => {
  afterEach(() => {
    listServiceFitMock.mockReset();
    regenerateServiceFitMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it('renderiza empty state con data vacía', async () => {
    listServiceFitMock.mockResolvedValue({ data: [] });

    renderList();

    await waitFor(() => {
      expect(
        screen.getByText('Aún sin recomendaciones. Lanza o regenera el análisis.'),
      ).toBeInTheDocument();
    });
  });

  it('renderiza card con fit_score y rationale', async () => {
    listServiceFitMock.mockResolvedValue({
      data: [
        {
          id: 'service_fit_1',
          company_id: 'company_1',
          service_line_id: 'service_line_1',
          service_line_key: 'automation',
          service_line_label_es: 'Automatización',
          triggering_signals: ['late_replies', 'manual_followup'],
          rationale_es: 'Hay demasiadas tareas manuales y respuestas tardías.',
          expected_outcome_es: 'Reducir tiempos de seguimiento.',
          fit_score: 94,
          generated_by: 'claude',
          created_at: '2026-05-02T10:00:00.000Z',
          updated_at: '2026-05-02T10:00:00.000Z',
        },
      ],
    });

    renderList();

    await waitFor(() => {
      expect(screen.getByText('Automatización')).toBeInTheDocument();
    });

    expect(screen.getByText('94/100')).toBeInTheDocument();
    expect(
      screen.getByText('Hay demasiadas tareas manuales y respuestas tardías.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Claude')).toBeInTheDocument();
  });
});

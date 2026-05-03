/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OutboundPrepCard } from './OutboundPrepCard';

const getOutboundPrepMock = vi.fn();
const regenerateOutboundPrepMock = vi.fn();
const updateOutboundPrepMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('@/lib/api/intel', () => ({
  getOutboundPrep: (...args: unknown[]) => getOutboundPrepMock(...args),
  regenerateOutboundPrep: (...args: unknown[]) => regenerateOutboundPrepMock(...args),
  updateOutboundPrep: (...args: unknown[]) => updateOutboundPrepMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function renderCard(): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={client}>
      <OutboundPrepCard companyId="company_1" />
    </QueryClientProvider>,
  );
}

describe('OutboundPrepCard', () => {
  afterEach(() => {
    getOutboundPrepMock.mockReset();
    regenerateOutboundPrepMock.mockReset();
    updateOutboundPrepMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it('renderiza skeleton mientras carga', () => {
    getOutboundPrepMock.mockImplementation(() => new Promise(() => undefined));

    renderCard();

    expect(screen.getByTestId('outbound-prep-skeleton')).toBeInTheDocument();
  });

  it('renderiza generar briefing cuando data es null', async () => {
    getOutboundPrepMock.mockResolvedValue(null);

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Generar briefing de outreach')).toBeInTheDocument();
    });
  });

  it('renderiza campos de briefing cuando data existe', async () => {
    getOutboundPrepMock.mockResolvedValue({
      id: 'outbound_prep_1',
      company_id: 'company_1',
      segment: 'Clinicas privadas',
      likely_need: 'Mejorar velocidad comercial',
      outreach_angle: 'Abrir con leads sin respuesta',
      value_proposition: 'Más citas con menos seguimiento manual',
      service_pitch: 'Automatización comercial con soporte web',
      tone_guidance: 'Consultivo y directo',
      priority_score: 82,
      sdr_notes: 'Usar ejemplo de cliente similar',
      last_generated_at: '2026-05-02T10:00:00.000Z',
      last_generated_by_id: 'user_1',
      created_at: '2026-05-02T10:00:00.000Z',
      updated_at: '2026-05-02T10:00:00.000Z',
    });

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Outbound Prep')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Clinicas privadas')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mejorar velocidad comercial')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Usar ejemplo de cliente similar')).toBeInTheDocument();
    expect(screen.getByText('Prioridad alta · 82/100')).toBeInTheDocument();
  });
});

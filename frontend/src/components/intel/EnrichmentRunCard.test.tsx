/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EnrichmentRunCard } from './EnrichmentRunCard';

const getEnrichmentRunMock = vi.fn();

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/api/intel', async () => {
  const actual = await vi.importActual('@/lib/api/intel');
  return {
    ...(actual as object),
    getEnrichmentRun: (...args: unknown[]) => getEnrichmentRunMock(...args),
  };
});

function renderWithProviders(node: JSX.Element): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function buildRun(status: 'queued' | 'running' | 'partial' | 'succeeded' | 'failed') {
  return {
    id: 'run_1',
    status,
    input_url: 'https://cafe-ejemplo.es',
    company_id: 'cmp_1',
    started_at: '2026-05-02T10:00:00.000Z',
    finished_at: status === 'succeeded' ? '2026-05-02T10:00:08.000Z' : null,
    error_message: null,
    summary: { source_hits_count: 4 },
    source_hits: [],
    pain_points_created_count: 2,
    service_fits_created_count: 1,
  };
}

describe('EnrichmentRunCard', () => {
  beforeEach(() => {
    getEnrichmentRunMock.mockReset();
  });

  it("estado 'running': muestra badge 'En curso' y no muestra botón 'Ver empresa'", async () => {
    getEnrichmentRunMock.mockResolvedValue(buildRun('running'));

    renderWithProviders(<EnrichmentRunCard runId="run_1" />);

    expect(await screen.findByText('En curso')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver empresa →' })).not.toBeInTheDocument();
  });

  it("estado 'succeeded': muestra badge 'Completado' y botón con href a la empresa", async () => {
    getEnrichmentRunMock.mockResolvedValue(buildRun('succeeded'));

    renderWithProviders(<EnrichmentRunCard runId="run_1" />);

    expect(await screen.findByText('Completado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver empresa →' })).toHaveAttribute(
      'href',
      '/companies/cmp_1',
    );
  });
});

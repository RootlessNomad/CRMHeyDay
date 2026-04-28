/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalSearch } from './GlobalSearch';

const pushSpy = vi.fn();
const searchAllMock = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushSpy }) }));
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
  },
}));
vi.mock('@/lib/api/search', () => ({ searchAll: (...args: unknown[]) => searchAllMock(...args) }));

function renderWithProviders(node: JSX.Element): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

async function typeSearch(value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByRole('searchbox'), { target: { value } });
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    pushSpy.mockReset();
    searchAllMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render the palette when open is false', () => {
    renderWithProviders(<GlobalSearch open={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/buscar empresas/i)).not.toBeInTheDocument();
  });

  it('shows the minimum character hint for short queries', () => {
    renderWithProviders(<GlobalSearch open onClose={vi.fn()} />);

    expect(screen.getByText('Escribe al menos 2 caracteres.')).toBeInTheDocument();
  });

  it('renders section headers and items from search results', async () => {
    searchAllMock.mockResolvedValue({
      query: 'ac',
      companies: [{ id: 'c1', type: 'company', title: 'Acme', subtitle: 'acme.com', score: 1 }],
      contacts: [],
      leads: [],
      activities: [],
    });

    renderWithProviders(<GlobalSearch open onClose={vi.fn()} />);

    await typeSearch('ac');

    expect(await screen.findByText('Empresas')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /acme/i })).toBeInTheDocument();
    expect(screen.getByText('acme.com')).toBeInTheDocument();
  });

  it('clicking a company hit navigates and closes the palette', async () => {
    const onClose = vi.fn();
    searchAllMock.mockResolvedValue({
      query: 'ac',
      companies: [{ id: 'c1', type: 'company', title: 'Acme', subtitle: 'acme.com', score: 1 }],
      contacts: [],
      leads: [],
      activities: [],
    });

    renderWithProviders(<GlobalSearch open onClose={onClose} />);

    await typeSearch('ac');
    fireEvent.click(await screen.findByRole('option', { name: /acme/i }));

    expect(pushSpy).toHaveBeenCalledWith('/companies/c1');
    expect(onClose).toHaveBeenCalled();
  });
});

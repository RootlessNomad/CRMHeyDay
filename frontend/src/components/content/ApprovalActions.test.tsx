/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApprovalActions } from './ApprovalActions';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/api/content', async () => {
  const actual = await vi.importActual('@/lib/api/content');
  return {
    ...(actual as object),
    submitForReview: vi.fn(),
    approveItem: vi.fn(),
    rejectItem: vi.fn(),
  };
});

function renderWithProviders(node: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('ApprovalActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza botón 'Enviar a revisión' cuando status=draft", () => {
    renderWithProviders(<ApprovalActions itemId="item_1" status="draft" />);

    expect(screen.getByRole('button', { name: 'Enviar a revisión' })).toBeInTheDocument();
  });

  it('renderiza botones Aprobar y Rechazar cuando status=in_review', () => {
    renderWithProviders(<ApprovalActions itemId="item_1" status="in_review" />);

    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
  });

  it('no renderiza botones de acción cuando status=approved', () => {
    const { container } = render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <ApprovalActions itemId="item_1" status="approved" />
      </QueryClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

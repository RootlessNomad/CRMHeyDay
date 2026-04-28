/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/lib/auth/store';

import { LeadFormDialog } from './LeadFormDialog';

const createLeadMock = vi.fn();
const updateLeadMock = vi.fn();
const listPipelinesMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/api/leads', async () => {
  const actual = await vi.importActual('@/lib/api/leads');
  return {
    ...(actual as object),
    createLead: (...args: unknown[]) => createLeadMock(...args),
    updateLead: (...args: unknown[]) => updateLeadMock(...args),
  };
});

vi.mock('@/lib/api/pipelines', async () => {
  const actual = await vi.importActual('@/lib/api/pipelines');
  return {
    ...(actual as object),
    listPipelines: (...args: unknown[]) => listPipelinesMock(...args),
  };
});

vi.mock('../contacts/CompanyPicker', () => ({
  CompanyPicker: ({
    value,
    onChange,
    inputId,
  }: {
    value: { id: string; name: string } | null;
    onChange: (next: { id: string; name: string } | null) => void;
    inputId?: string;
  }) => (
    <div>
      <input id={inputId} value={value?.name ?? ''} readOnly aria-label="Empresa" />
      <button type="button" onClick={() => onChange({ id: 'company_1', name: 'Acme' })}>
        Seleccionar empresa mock
      </button>
    </div>
  ),
}));

vi.mock('./ContactPicker', () => ({
  ContactPicker: ({
    value,
    onChange,
    inputId,
  }: {
    value: string;
    onChange: (id: string) => void;
    inputId?: string;
  }) => (
    <div>
      <input id={inputId} value={value} readOnly aria-label="Contacto" />
      <button type="button" onClick={() => onChange('contact_1')}>
        Seleccionar contacto mock
      </button>
    </div>
  ),
}));

async function renderWithProviders(node: JSX.Element): Promise<void> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  await act(async () => {
    render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  });
}

describe('LeadFormDialog', () => {
  beforeEach(() => {
    createLeadMock.mockReset();
    updateLeadMock.mockReset();
    listPipelinesMock.mockReset();
    useAuthStore.getState().setSession({
      user: {
        id: 'user_1',
        email: 'alex@heyday.test',
        name: 'Alex',
        role: 'admin',
        isActive: true,
        lastLoginAt: null,
      },
      accessToken: 'tok_1',
      accessExpiresAt: new Date().toISOString(),
    });
    listPipelinesMock.mockResolvedValue([
      {
        id: 'pipeline_a',
        name: 'Pipeline A',
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stages: [
          {
            id: 'stage_a1',
            pipelineId: 'pipeline_a',
            name: 'Discovery',
            orderIndex: 1,
            kind: 'open',
            color: null,
          },
          {
            id: 'stage_a2',
            pipelineId: 'pipeline_a',
            name: 'Proposal',
            orderIndex: 2,
            kind: 'open',
            color: null,
          },
        ],
      },
      {
        id: 'pipeline_b',
        name: 'Pipeline B',
        isDefault: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stages: [
          {
            id: 'stage_b1',
            pipelineId: 'pipeline_b',
            name: 'Qualified',
            orderIndex: 1,
            kind: 'open',
            color: null,
          },
        ],
      },
    ]);
  });

  afterEach(() => {
    useAuthStore.getState().clear();
    vi.restoreAllMocks();
  });

  it('happy create: pipeline + stage + company -> submit -> onSuccess', async () => {
    const onSuccess = vi.fn();
    const returnedLead = {
      id: 'lead_1',
      companyId: 'company_1',
      primaryContactId: null,
      pipelineId: 'pipeline_a',
      stageId: 'stage_a1',
      ownerId: 'user_1',
      source: 'manual',
      status: 'open',
      priorityScore: 0,
      priorityManual: null,
      nextActionAt: null,
      lostReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    createLeadMock.mockResolvedValue(returnedLead);

    await renderWithProviders(
      <LeadFormDialog open onClose={vi.fn()} mode="create" onSuccess={onSuccess} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/pipeline/i)).toHaveValue('pipeline_a');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /seleccionar empresa mock/i }));
      fireEvent.change(screen.getByLabelText(/^stage$/i), { target: { value: 'stage_a1' } });
      fireEvent.click(screen.getByRole('button', { name: /crear lead/i }));
    });

    await waitFor(() => {
      expect(createLeadMock).toHaveBeenCalledWith({
        companyId: 'company_1',
        pipelineId: 'pipeline_a',
        stageId: 'stage_a1',
        ownerId: 'user_1',
        primaryContactId: undefined,
        priorityManual: undefined,
        nextActionAt: undefined,
        source: 'manual',
      });
    });
    expect(onSuccess).toHaveBeenCalledWith(returnedLead);
  });

  it('stage reset: al cambiar pipeline usa el primer stage open del nuevo pipeline', async () => {
    await renderWithProviders(
      <LeadFormDialog open onClose={vi.fn()} mode="create" onSuccess={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/^stage$/i)).toHaveValue('stage_a1');
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^stage$/i), { target: { value: 'stage_a2' } });
    });
    expect(screen.getByLabelText(/^stage$/i)).toHaveValue('stage_a2');

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/pipeline/i), { target: { value: 'pipeline_b' } });
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/^stage$/i)).toHaveValue('stage_b1');
    });
  });
});

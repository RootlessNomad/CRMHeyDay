/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TagPicker } from './TagPicker';

const assignTagMock = vi.fn();
const createTagMock = vi.fn();
const listTagsMock = vi.fn();
const listTagsForEntityMock = vi.fn();
const unassignTagMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/api/tags', () => ({
  assignTag: (...args: unknown[]) => assignTagMock(...args),
  createTag: (...args: unknown[]) => createTagMock(...args),
  listTags: (...args: unknown[]) => listTagsMock(...args),
  listTagsForEntity: (...args: unknown[]) => listTagsForEntityMock(...args),
  unassignTag: (...args: unknown[]) => unassignTagMock(...args),
  isTagNameConflict: () => false,
  isTagAssignmentConflict: () => false,
}));

function renderWithProviders(node: JSX.Element): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

async function typeSearch(value: string): Promise<void> {
  await act(async () => {
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value } });
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
}

describe('TagPicker', () => {
  beforeEach(() => {
    assignTagMock.mockReset();
    createTagMock.mockReset();
    listTagsMock.mockReset();
    listTagsForEntityMock.mockReset();
    unassignTagMock.mockReset();

    assignTagMock.mockResolvedValue({
      id: 'tag_2',
      name: 'Pilates',
      color: null,
      kind: 'vertical',
      created_at: new Date().toISOString(),
    });
    createTagMock.mockResolvedValue({
      id: 'tag_3',
      name: 'Outbound',
      color: null,
      kind: 'persona',
      created_at: new Date().toISOString(),
    });
    listTagsMock.mockResolvedValue([]);
    listTagsForEntityMock.mockResolvedValue([]);
    unassignTagMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('entityId null renders hint text and no input', () => {
    renderWithProviders(<TagPicker entityType="company" entityId={null} />);

    expect(screen.getByText('Guarda primero para añadir tags.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('loads and renders assigned tags as chips', async () => {
    listTagsForEntityMock.mockResolvedValue([
      {
        id: 'tag_1',
        name: 'Healthcare',
        color: '#1188CC',
        kind: 'vertical',
        created_at: new Date().toISOString(),
      },
    ]);

    renderWithProviders(<TagPicker entityType="company" entityId="company_1" />);

    expect(await screen.findByText('Healthcare')).toBeInTheDocument();
    expect(listTagsForEntityMock).toHaveBeenCalledWith('company', 'company_1');
  });

  it('typing shows search results in listbox', async () => {
    listTagsMock.mockResolvedValue([
      {
        id: 'tag_2',
        name: 'Pilates',
        color: null,
        kind: 'vertical',
        created_at: new Date().toISOString(),
      },
    ]);

    renderWithProviders(<TagPicker entityType="company" entityId="company_1" />);

    await typeSearch('pi');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /pilates/i })).toBeInTheDocument();
  });

  it('clicking existing result calls assignTag with correct args', async () => {
    listTagsMock.mockResolvedValue([
      {
        id: 'tag_2',
        name: 'Pilates',
        color: null,
        kind: 'vertical',
        created_at: new Date().toISOString(),
      },
    ]);

    renderWithProviders(<TagPicker entityType="lead" entityId="lead_1" />);

    await typeSearch('pi');
    fireEvent.click(await screen.findByRole('option', { name: /pilates/i }));

    await waitFor(() => {
      expect(assignTagMock).toHaveBeenCalledWith({
        tag_id: 'tag_2',
        entity_type: 'lead',
        entity_id: 'lead_1',
      });
    });
  });

  it('clicking crear tag with kind selected calls createTag then assignTag', async () => {
    createTagMock.mockResolvedValue({
      id: 'tag_3',
      name: 'Outbound',
      color: null,
      kind: 'persona',
      created_at: new Date().toISOString(),
    });

    renderWithProviders(<TagPicker entityType="contact" entityId="contact_1" />);

    await typeSearch('Outbound');
    await screen.findByRole('button', { name: /crear tag 'outbound'/i });
    fireEvent.change(screen.getByLabelText('Tipo de tag'), { target: { value: 'persona' } });
    fireEvent.click(screen.getByRole('button', { name: /crear tag 'outbound'/i }));

    await waitFor(() => {
      expect(createTagMock).toHaveBeenCalledWith({ name: 'Outbound', kind: 'persona' });
      expect(assignTagMock).toHaveBeenCalledWith({
        tag_id: 'tag_3',
        entity_type: 'contact',
        entity_id: 'contact_1',
      });
    });
  });

  it('clicking x on chip calls unassignTag', async () => {
    listTagsForEntityMock.mockResolvedValue([
      {
        id: 'tag_1',
        name: 'Healthcare',
        color: null,
        kind: 'vertical',
        created_at: new Date().toISOString(),
      },
    ]);

    renderWithProviders(<TagPicker entityType="company" entityId="company_1" />);

    fireEvent.click(await screen.findByRole('button', { name: /quitar tag healthcare/i }));

    await waitFor(() => {
      expect(unassignTagMock).toHaveBeenCalledWith({
        tag_id: 'tag_1',
        entity_type: 'company',
        entity_id: 'company_1',
      });
    });
  });
});

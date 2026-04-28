/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContactFormDialog } from './ContactFormDialog';

const createContactMock = vi.fn();
const updateContactMock = vi.fn();
const listCompaniesMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/api/contacts', async () => {
  const actual = await vi.importActual('@/lib/api/contacts');
  return {
    ...(actual as object),
    createContact: (...args: unknown[]) => createContactMock(...args),
    updateContact: (...args: unknown[]) => updateContactMock(...args),
  };
});

vi.mock('@/lib/api/companies', async () => {
  const actual = await vi.importActual('@/lib/api/companies');
  return {
    ...(actual as object),
    listCompanies: (...args: unknown[]) => listCompaniesMock(...args),
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

describe('ContactFormDialog', () => {
  beforeEach(() => {
    createContactMock.mockReset();
    updateContactMock.mockReset();
    listCompaniesMock.mockReset();
    listCompaniesMock.mockResolvedValue({ items: [], page: 1, pageSize: 8, total: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('render create con campos vacíos y primary deshabilitado', () => {
    renderWithProviders(
      <ContactFormDialog open onClose={vi.fn()} mode="create" onSuccess={vi.fn()} />,
    );

    expect(screen.getByLabelText(/nombre/i)).toHaveValue('');
    expect(screen.getByLabelText(/email/i)).toHaveValue('');
    expect(screen.getByLabelText(/contacto principal/i)).toBeDisabled();
  });

  it('validación: submit sin first_name muestra error', async () => {
    renderWithProviders(
      <ContactFormDialog open onClose={vi.fn()} mode="create" onSuccess={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /crear contacto/i }));

    expect(await screen.findByText(/requerido/i)).toBeInTheDocument();
    expect(createContactMock).not.toHaveBeenCalled();
  });

  it('mode edit precarga valores', () => {
    renderWithProviders(
      <ContactFormDialog
        open
        onClose={vi.fn()}
        mode="edit"
        contact={{
          id: 'contact_1',
          company_id: 'company_1',
          first_name: 'Alex',
          last_name: 'Avila',
          role_title: 'Founder',
          email: 'alex@heyday.test',
          phone: '+34123456789',
          whatsapp: null,
          linkedin_url: null,
          is_primary: true,
          consent_status: 'explicit_granted',
          created_by_id: 'user_1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          anonymized_at: null,
        }}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Alex');
    expect(screen.getByLabelText(/apellidos/i)).toHaveValue('Avila');
    expect(screen.getByLabelText(/email/i)).toHaveValue('alex@heyday.test');
  });
});

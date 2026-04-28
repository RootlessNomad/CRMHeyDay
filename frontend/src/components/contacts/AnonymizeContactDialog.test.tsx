/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnonymizeContactDialog } from './AnonymizeContactDialog';

const anonymizeContactMock = vi.fn();

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
    anonymizeContact: (...args: unknown[]) => anonymizeContactMock(...args),
  };
});

describe('AnonymizeContactDialog', () => {
  beforeEach(() => {
    anonymizeContactMock.mockReset();
    anonymizeContactMock.mockResolvedValue({ id: 'contact_1' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('botón disabled si no se escribe ANONIMIZAR', () => {
    render(
      <AnonymizeContactDialog
        open
        onClose={vi.fn()}
        contact={{ id: 'contact_1', first_name: 'Alex', last_name: 'Avila' }}
        onAnonymized={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /^anonimizar$/i })).toBeDisabled();
  });

  it('al escribir ANONIMIZAR se habilita', () => {
    render(
      <AnonymizeContactDialog
        open
        onClose={vi.fn()}
        contact={{ id: 'contact_1', first_name: 'Alex', last_name: 'Avila' }}
        onAnonymized={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/confirmación/i), {
      target: { value: 'ANONIMIZAR' },
    });

    expect(screen.getByRole('button', { name: /^anonimizar$/i })).toBeEnabled();
  });

  it('click llama anonymizeContact', async () => {
    render(
      <AnonymizeContactDialog
        open
        onClose={vi.fn()}
        contact={{ id: 'contact_1', first_name: 'Alex', last_name: 'Avila' }}
        onAnonymized={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/confirmación/i), {
      target: { value: 'ANONIMIZAR' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^anonimizar$/i }));

    await waitFor(() => {
      expect(anonymizeContactMock).toHaveBeenCalledWith('contact_1');
    });
  });
});

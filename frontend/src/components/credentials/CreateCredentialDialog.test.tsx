/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CredentialDto } from '@/lib/api/credentials';

const SAMPLE_CRED: CredentialDto = {
  id: 'cred_001',
  key: 'openai_api_key',
  provider: 'openai',
  label: 'OpenAI API Key',
  keyVersion: 1,
  isActive: true,
  lastUsedAt: null,
  lastRotatedAt: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  health: null,
};

const { createCredentialMock, toastErrorMock } = vi.hoisted(() => ({
  createCredentialMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@/lib/api/credentials', () => ({
  createCredential: createCredentialMock,
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: vi.fn(),
  },
}));

vi.mock('@/components/Modal', () => ({
  Modal: ({
    open,
    children,
    title,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: string;
  }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

const { CreateCredentialDialog } = await import('./CreateCredentialDialog');

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof CreateCredentialDialog>> = {},
): {
  onClose: ReturnType<typeof vi.fn>;
  onCreated: ReturnType<typeof vi.fn>;
} {
  const onClose = vi.fn();
  const onCreated = vi.fn();

  render(
    <CreateCredentialDialog open={true} onClose={onClose} onCreated={onCreated} {...overrides} />,
  );

  return { onClose, onCreated };
}

describe('CreateCredentialDialog', () => {
  it('submit válido llama createCredential con los valores correctos', async () => {
    createCredentialMock.mockResolvedValueOnce(SAMPLE_CRED);
    const { onCreated } = renderDialog();

    fireEvent.change(screen.getByLabelText(/Key/i), {
      target: { name: 'key', value: 'openai_api_key' },
    });
    fireEvent.change(screen.getByLabelText(/Provider/i), {
      target: { name: 'provider', value: 'openai' },
    });
    fireEvent.change(screen.getByLabelText(/Label/i), {
      target: { name: 'label', value: 'OpenAI API Key' },
    });
    fireEvent.change(screen.getByLabelText(/Secreto/i), {
      target: { name: 'plaintext', value: 'sk-supersecret' },
    });

    fireEvent.submit(screen.getByRole('button', { name: 'Añadir credencial' }).closest('form')!);

    await waitFor(() => {
      expect(createCredentialMock).toHaveBeenCalledWith({
        key: 'openai_api_key',
        provider: 'openai',
        label: 'OpenAI API Key',
        plaintext: 'sk-supersecret',
      });
      expect(onCreated).toHaveBeenCalledWith(SAMPLE_CRED);
    });
  });

  it('error 409 muestra toast de key duplicada', async () => {
    const conflictError = Object.assign(new Error('conflict'), { status: 409 });
    Object.setPrototypeOf(conflictError, (await import('@/lib/api/client')).ApiError.prototype);
    createCredentialMock.mockRejectedValueOnce(conflictError);

    renderDialog();

    fireEvent.change(screen.getByLabelText(/Key/i), {
      target: { name: 'key', value: 'openai_api_key' },
    });
    fireEvent.change(screen.getByLabelText(/Provider/i), {
      target: { name: 'provider', value: 'openai' },
    });
    fireEvent.change(screen.getByLabelText(/Label/i), {
      target: { name: 'label', value: 'OpenAI API Key' },
    });
    fireEvent.change(screen.getByLabelText(/Secreto/i), {
      target: { name: 'plaintext', value: 'sk-supersecret' },
    });

    fireEvent.submit(screen.getByRole('button', { name: 'Añadir credencial' }).closest('form')!);

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('Ya existe una credencial con esa key.');
    });
  });

  it('key con espacios muestra error de validación', async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(/Key/i), {
      target: { name: 'key', value: 'key con espacios' },
    });
    fireEvent.change(screen.getByLabelText(/Provider/i), {
      target: { name: 'provider', value: 'test' },
    });
    fireEvent.change(screen.getByLabelText(/Label/i), { target: { name: 'label', value: 'Test' } });
    fireEvent.change(screen.getByLabelText(/Secreto/i), {
      target: { name: 'plaintext', value: 'secret' },
    });

    fireEvent.submit(screen.getByRole('button', { name: 'Añadir credencial' }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/Solo minúsculas/i)).toBeInTheDocument();
    });

    expect(createCredentialMock).not.toHaveBeenCalled();
  });
});

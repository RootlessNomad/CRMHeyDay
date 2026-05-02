/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CredentialDto } from '@/lib/api/credentials';

import { CredentialsTable } from './CredentialsTable';

const activeCred: CredentialDto = {
  id: 'cred_active',
  key: 'openai_api_key',
  provider: 'openai',
  label: 'OpenAI API Key',
  keyVersion: 1,
  isActive: true,
  lastUsedAt: null,
  lastRotatedAt: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  health: {
    lastStatus: 'ok',
    lastCheckedAt: null,
    lastError: null,
    successCount24h: 5,
    errorCount24h: 0,
  },
};

const inactiveCred: CredentialDto = {
  id: 'cred_inactive',
  key: 'google_places',
  provider: 'google',
  label: 'Google Places API',
  keyVersion: 1,
  isActive: false,
  lastUsedAt: null,
  lastRotatedAt: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  health: {
    lastStatus: 'error',
    lastCheckedAt: null,
    lastError: 'Unauthorized',
    successCount24h: 0,
    errorCount24h: 3,
  },
};

function renderTable(
  credentials: CredentialDto[],
  overrides: Partial<React.ComponentProps<typeof CredentialsTable>> = {},
): {
  onRotate: ReturnType<typeof vi.fn>;
  onToggleActive: ReturnType<typeof vi.fn>;
  onDelete: ReturnType<typeof vi.fn>;
  onTest: ReturnType<typeof vi.fn>;
} {
  const onRotate = vi.fn();
  const onToggleActive = vi.fn();
  const onDelete = vi.fn();
  const onTest = vi.fn();

  render(
    <CredentialsTable
      credentials={credentials}
      onRotate={onRotate}
      onToggleActive={onToggleActive}
      onDelete={onDelete}
      onTest={onTest}
      {...overrides}
    />,
  );

  return { onRotate, onToggleActive, onDelete, onTest };
}

describe('CredentialsTable', () => {
  it('renderiza credencial activa con key, label y chip OK', () => {
    renderTable([activeCred]);

    expect(screen.getByText('openai_api_key')).toBeInTheDocument();
    expect(screen.getByText('OpenAI API Key')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('botón Probar está disabled en credencial inactiva', () => {
    renderTable([inactiveCred]);

    const row = screen.getByText('google_places').closest('tr');
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLTableRowElement).getByRole('button', { name: 'Probar' }),
    ).toBeDisabled();
  });

  it('click Rotar llama onRotate con la credencial correcta', () => {
    const { onRotate } = renderTable([activeCred]);

    const row = screen.getByText('openai_api_key').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Rotar' }));

    expect(onRotate).toHaveBeenCalledWith(activeCred);
  });

  it('click Probar (activa) llama onTest con la credencial correcta', () => {
    const { onTest } = renderTable([activeCred]);

    const row = screen.getByText('openai_api_key').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Probar' }));

    expect(onTest).toHaveBeenCalledWith(activeCred);
  });

  it('click Eliminar llama onDelete con la credencial correcta', () => {
    const { onDelete } = renderTable([activeCred]);

    const row = screen.getByText('openai_api_key').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Eliminar' }));

    expect(onDelete).toHaveBeenCalledWith(activeCred);
  });
});

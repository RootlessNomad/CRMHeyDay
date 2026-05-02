/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { UserDto } from '@/lib/api/users';

import { UsersTable } from './UsersTable';

const users: UserDto[] = [
  {
    id: 'usr_admin',
    email: 'admin@heyday.test',
    name: 'Ada Admin',
    role: 'admin',
    isActive: true,
    lastLoginAt: '2026-04-29T08:00:00.000Z',
  },
  {
    id: 'usr_operator',
    email: 'ops@heyday.test',
    name: 'Olga Ops',
    role: 'operator',
    isActive: true,
    lastLoginAt: null,
  },
  {
    id: 'usr_viewer',
    email: 'viewer@heyday.test',
    name: 'Vera View',
    role: 'viewer',
    isActive: false,
    lastLoginAt: null,
  },
];

function renderTable(overrides: Partial<React.ComponentProps<typeof UsersTable>> = {}): {
  onEdit: ReturnType<typeof vi.fn>;
  onResetPassword: ReturnType<typeof vi.fn>;
  onToggleActive: ReturnType<typeof vi.fn>;
} {
  const onEdit = vi.fn();
  const onResetPassword = vi.fn();
  const onToggleActive = vi.fn();

  render(
    <UsersTable
      users={users}
      currentUserId="usr_admin"
      onEdit={onEdit}
      onResetPassword={onResetPassword}
      onToggleActive={onToggleActive}
      {...overrides}
    />,
  );

  return { onEdit, onResetPassword, onToggleActive };
}

describe('UsersTable', () => {
  it('renderiza la tabla con usuarios y badges de rol', () => {
    renderTable();

    expect(screen.getByText('Ada Admin')).toBeInTheDocument();
    expect(screen.getByText('admin@heyday.test')).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(screen.getByText('Operador')).toBeInTheDocument();
    expect(screen.getByText('Visor')).toBeInTheDocument();
  });

  it('botón Editar llama a onEdit con el usuario correcto', () => {
    const { onEdit } = renderTable();

    const row = screen.getByText('Olga Ops').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Editar' }));

    expect(onEdit).toHaveBeenCalledWith(users[1]);
  });

  it('botón Reset pwd llama a onResetPassword con el usuario correcto', () => {
    const { onResetPassword } = renderTable();

    const row = screen.getByText('Vera View').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Reset pwd' }));

    expect(onResetPassword).toHaveBeenCalledWith(users[2]);
  });

  it('toggle activo queda deshabilitado para el usuario actual', () => {
    renderTable({ currentUserId: 'usr_admin' });

    const row = screen.getByText('Ada Admin').closest('tr');
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLTableRowElement).getByRole('button', { name: 'Desactivar' }),
    ).toBeDisabled();
  });

  it('badge de rol muestra las clases correctas para admin, operator y viewer', () => {
    renderTable();

    expect(screen.getByText('Administrador')).toHaveClass('text-blue-600', 'bg-blue-50');
    expect(screen.getByText('Operador')).toHaveClass('text-green-600', 'bg-green-50');
    expect(screen.getByText('Visor')).toHaveClass('text-text-muted', 'bg-surface-muted');
  });
});

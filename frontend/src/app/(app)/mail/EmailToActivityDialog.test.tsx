/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { emailToActivityMock } = vi.hoisted(() => ({
  emailToActivityMock: vi.fn(),
}));

vi.mock('@/lib/api/mail', () => ({
  emailToActivity: emailToActivityMock,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/Modal', () => ({
  Modal: ({ open, children, title }: { open: boolean; children: ReactNode; title: string }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

const { EmailToActivityDialog } = await import('./EmailToActivityDialog');

function renderDialog() {
  render(
    <EmailToActivityDialog
      open={true}
      onClose={vi.fn()}
      accountId="acc_1"
      uid={42}
      folder="INBOX"
      defaultTitle="Email: Seguimiento comercial"
      defaultBody="Contenido resumido"
    />,
  );
}

describe('EmailToActivityDialog', () => {
  it('renders with open=true', () => {
    renderDialog();

    expect(screen.getByText('Registrar como actividad en el CRM')).toBeInTheDocument();
  });

  it('pre-fills title from defaultTitle prop', () => {
    renderDialog();

    expect(screen.getByLabelText('Título')).toHaveValue('Email: Seguimiento comercial');
  });

  it('pre-fills body from defaultBody prop', () => {
    renderDialog();

    expect(screen.getByLabelText('Descripción')).toHaveValue('Contenido resumido');
  });

  it('submit button is disabled when entity_id is empty', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Registrar actividad' })).toBeDisabled();
  });
});

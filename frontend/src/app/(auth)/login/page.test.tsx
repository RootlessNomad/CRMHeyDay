/// <reference types="@testing-library/jest-dom" />
// Smoke test de la página de login.
// Cubre: render básico, validación zod en cliente (email inválido + password corta),
// y disabled state del botón mientras la request está in-flight.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/lib/auth/store';

import LoginPage from './page';

const replaceMock = vi.fn();
const getMock = vi.fn(() => null);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({ get: getMock }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    replaceMock.mockReset();
    getMock.mockReset();
    getMock.mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza email, password y botón Entrar habilitado', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /entrar/i });
    expect(button).toBeEnabled();
  });

  it('muestra errores de validación cuando los campos no son válidos', () => {
    render(<LoginPage />);
    const email = screen.getByLabelText(/email/i);
    const password = screen.getByLabelText(/contraseña/i);
    fireEvent.change(email, { target: { value: 'no-es-email' } });
    fireEvent.change(password, { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(screen.getByText(/email inválido/i)).toBeInTheDocument();
    expect(screen.getByText(/mínimo 8 caracteres/i)).toBeInTheDocument();
  });

  it('deshabilita el botón mientras la request está en curso', async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((r) => {
      resolveFetch = r;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => pending);

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'alex@heyday.test' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'password123' },
    });
    const button = screen.getByRole('button', { name: /entrar/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /entrando/i })).toBeDisabled();
    });

    resolveFetch(
      jsonResponse({
        user: {
          id: 'u1',
          email: 'alex@heyday.test',
          name: 'Alex',
          role: 'admin',
          isActive: true,
          lastLoginAt: null,
        },
        accessToken: 'tok_abc',
        accessExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    });
    expect(useAuthStore.getState().accessToken).toBe('tok_abc');
  });
});

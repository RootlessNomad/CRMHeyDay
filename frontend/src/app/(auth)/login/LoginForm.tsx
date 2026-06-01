'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { ApiError } from '@/lib/api/client';
import { loginRequest } from '@/lib/auth/api';
import { useAuthStore } from '@/lib/auth/store';
import { copyForError } from '@/lib/error-messages';

const LoginSchema = z.object({
  email: z.string().email({ message: 'Email inválido' }),
  password: z.string().min(8, { message: 'Mínimo 8 caracteres' }),
});

export function LoginForm(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  // Cortesía: si ya hay sesión válida en memoria, no mostramos el login.
  // (El middleware ya no rebota por cookie, así que este redirect lo hace el
  // cliente con datos de fiar; una cookie inválida deja ver el formulario.)
  useEffect(() => {
    if (user && accessToken) {
      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/') ? next : '/dashboard');
    }
  }, [user, accessToken, router, searchParams]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrors({});

    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0];
        if (k === 'email' || k === 'password') fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await loginRequest(parsed.data.email, parsed.data.password);
      setSession(result);
      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/') ? next : '/dashboard');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
      toast.error(copyForError(code));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">HeyDay</h1>
        <p className="text-text-muted mt-2 text-sm">CRM + Lead Intelligence + Content</p>
      </div>

      <div className="border-border bg-surface rounded-lg border p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-semibold">Inicia sesión</h2>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              disabled={submitting}
            />
            {errors.email ? (
              <p id="email-error" className="text-danger text-xs">
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              disabled={submitting}
            />
            {errors.password ? (
              <p id="password-error" className="text-danger text-xs">
                {errors.password}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="bg-accent h-10 w-full rounded-md text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="text-text-muted mt-6 text-center text-xs">
          ¿Problemas para acceder? Contacta con un administrador.
        </p>
      </div>
    </div>
  );
}

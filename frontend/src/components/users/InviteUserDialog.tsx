'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { z } from 'zod';

import { Modal } from '@/components/Modal';
import { ApiError } from '@/lib/api/client';
import { inviteUser, type InviteUserInput, type UserRole } from '@/lib/api/users';

interface InviteUserDialogProps {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

interface InviteUserFormState {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

type InviteUserField = keyof InviteUserFormState;
type InviteUserErrors = Partial<Record<InviteUserField | 'form', string>>;

const InviteUserSchema = z.object({
  email: z.string().trim().min(1, { message: 'Requerido' }).email({ message: 'Email inválido' }),
  name: z
    .string()
    .trim()
    .min(1, { message: 'Requerido' })
    .max(120, { message: 'Máximo 120 caracteres' }),
  password: z
    .string()
    .min(8, { message: 'Mínimo 8 caracteres' })
    .max(128, { message: 'Máximo 128 caracteres' }),
  role: z.enum(['admin', 'operator', 'viewer']),
});

function emptyState(): InviteUserFormState {
  return {
    email: '',
    name: '',
    password: '',
    role: 'operator',
  };
}

function collectFieldErrors(error: z.ZodError<InviteUserInput>): InviteUserErrors {
  const fieldErrors: InviteUserErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string') {
      fieldErrors[field as InviteUserField] = issue.message;
    }
  }

  return fieldErrors;
}

function renderGenericError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Este email ya está registrado';
  }

  return 'No se pudo invitar al usuario.';
}

export function InviteUserDialog({
  open,
  onClose,
  onInvited,
}: InviteUserDialogProps): JSX.Element | null {
  const [form, setForm] = useState<InviteUserFormState>(emptyState());
  const [errors, setErrors] = useState<InviteUserErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(emptyState());
    setErrors({});
    setSubmitting(false);
    setShowPassword(false);
  }, [open]);

  function updateField<K extends InviteUserField>(field: K, value: InviteUserFormState[K]): void {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const field = event.target.name as InviteUserField;
    updateField(field, event.target.value as InviteUserFormState[typeof field]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors({});

    const payload: InviteUserInput = {
      email: form.email.trim(),
      name: form.name.trim(),
      password: form.password,
      role: form.role,
    };

    const parsed = InviteUserSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(collectFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await inviteUser(parsed.data);
      onInvited();
    } catch (error) {
      setErrors({ form: renderGenericError(error) });
    } finally {
      setSubmitting(false);
    }
  }

  function renderFieldError(field: InviteUserField): JSX.Element | null {
    const message = errors[field];
    if (!message) return null;
    return <p className="text-danger text-xs">{message}</p>;
  }

  return (
    <Modal open={open} onClose={onClose} title="Invitar usuario">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="invite-user-email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="invite-user-email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.email)}
            />
            {renderFieldError('email')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-user-name" className="block text-sm font-medium">
              Nombre
            </label>
            <input
              id="invite-user-name"
              name="name"
              value={form.name}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.name)}
            />
            {renderFieldError('name')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-user-role" className="block text-sm font-medium">
              Rol
            </label>
            <select
              id="invite-user-role"
              name="role"
              value={form.role}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            >
              <option value="admin">Administrador</option>
              <option value="operator">Operador</option>
              <option value="viewer">Visor</option>
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="invite-user-password" className="block text-sm font-medium">
              Contraseña inicial
            </label>
            <div className="flex gap-2">
              <input
                id="invite-user-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleInputChange}
                disabled={submitting}
                className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                aria-invalid={Boolean(errors.password)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="border-border bg-surface-muted hover:bg-bg h-10 shrink-0 rounded-md border px-3 text-sm font-medium transition"
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {renderFieldError('password')}
          </div>
        </div>

        {errors.form ? <p className="text-danger text-sm">{errors.form}</p> : null}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? 'Invitando…' : 'Invitar usuario'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

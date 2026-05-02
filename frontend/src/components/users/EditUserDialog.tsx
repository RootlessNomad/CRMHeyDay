'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { z } from 'zod';

import { Modal } from '@/components/Modal';
import { ApiError } from '@/lib/api/client';
import { updateUser, type PatchUserInput, type UserDto, type UserRole } from '@/lib/api/users';

interface EditUserDialogProps {
  open: boolean;
  onClose: () => void;
  user: UserDto | null;
  onUpdated: () => void;
}

interface EditUserFormState {
  name: string;
  role: UserRole;
  isActive: boolean;
}

type EditUserField = keyof EditUserFormState;
type EditUserErrors = Partial<Record<EditUserField | 'form', string>>;

const EditUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Requerido' })
    .max(120, { message: 'Máximo 120 caracteres' }),
  role: z.enum(['admin', 'operator', 'viewer']),
  isActive: z.boolean(),
});

function stateFromUser(user: UserDto | null): EditUserFormState {
  return {
    name: user?.name ?? '',
    role: user?.role ?? 'operator',
    isActive: user?.isActive ?? true,
  };
}

function collectValidationErrors(details: unknown): EditUserErrors {
  if (!Array.isArray(details)) return {};

  const errors: EditUserErrors = {};
  for (const issue of details) {
    if (!issue || typeof issue !== 'object') continue;
    const path = 'path' in issue ? issue.path : undefined;
    const message = 'message' in issue ? issue.message : undefined;
    const field = Array.isArray(path) ? path[0] : undefined;
    if (typeof field === 'string' && typeof message === 'string') {
      errors[field as EditUserField] = message;
    }
  }

  return errors;
}

export function EditUserDialog({
  open,
  onClose,
  user,
  onUpdated,
}: EditUserDialogProps): JSX.Element | null {
  const [form, setForm] = useState<EditUserFormState>(stateFromUser(user));
  const [errors, setErrors] = useState<EditUserErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(stateFromUser(user));
    setErrors({});
    setSubmitting(false);
  }, [open, user]);

  function updateField<K extends EditUserField>(field: K, value: EditUserFormState[K]): void {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const field = event.target.name as EditUserField;
    const value =
      event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value;
    updateField(field, value as EditUserFormState[typeof field]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!user) return;

    setErrors({});
    const payload: PatchUserInput = {
      name: form.name.trim(),
      role: form.role,
      isActive: form.isActive,
    };

    const parsed = EditUserSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: EditUserErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          fieldErrors[field as EditUserField] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await updateUser(user.id, parsed.data);
      onUpdated();
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        const fieldErrors = collectValidationErrors(error.details);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          return;
        }

        setErrors({ form: error.message });
        return;
      }

      setErrors({ form: 'No se pudo guardar el usuario.' });
    } finally {
      setSubmitting(false);
    }
  }

  function renderFieldError(field: EditUserField): JSX.Element | null {
    const message = errors[field];
    if (!message) return null;
    return <p className="text-danger text-xs">{message}</p>;
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar usuario">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="edit-user-name" className="block text-sm font-medium">
              Nombre
            </label>
            <input
              id="edit-user-name"
              name="name"
              value={form.name}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.name)}
            />
            {renderFieldError('name')}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="edit-user-role" className="block text-sm font-medium">
              Rol
            </label>
            <select
              id="edit-user-role"
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
        </div>

        <div className="border-border rounded-lg border px-4 py-3">
          <label className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Usuario activo</p>
              <p className="text-text-muted text-xs">
                Si lo desactivas, no podrá iniciar sesión hasta reactivarlo.
              </p>
            </div>
            <input
              type="checkbox"
              name="isActive"
              checked={form.isActive}
              onChange={handleInputChange}
              disabled={submitting}
              className="accent-accent h-4 w-4"
            />
          </label>
          {renderFieldError('isActive')}
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
            disabled={submitting || !user}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

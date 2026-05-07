'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';

import { Modal } from '@/components/Modal';
import { ApiError } from '@/lib/api/client';
import {
  deleteAccount,
  type EmailAccountDto,
  updateAccount,
  type UpdateEmailAccountInput,
} from '@/lib/api/mail';

interface EditAccountDialogProps {
  account: EmailAccountDto | null;
  open: boolean;
  onClose: () => void;
}

interface EditAccountFormState {
  display_name: string;
  imap_host: string;
  imap_port: string;
  smtp_host: string;
  smtp_port: string;
  password: string;
}

type EditAccountField = keyof EditAccountFormState;
type EditAccountErrors = Partial<Record<EditAccountField, string>>;

const editAccountSchema = z.object({
  display_name: z.string().trim().optional(),
  imap_host: z.string().trim().min(1, 'Requerido'),
  imap_port: z.coerce.number().int().positive('Puerto inválido'),
  smtp_host: z.string().trim().min(1, 'Requerido'),
  smtp_port: z.coerce.number().int().positive('Puerto inválido'),
  password: z.string().optional(),
});

function buildState(account: EmailAccountDto | null): EditAccountFormState {
  return {
    display_name: account?.displayName ?? '',
    imap_host: account?.imapHost ?? 'imap.hostinger.com',
    imap_port: String(account?.imapPort ?? 993),
    smtp_host: account?.smtpHost ?? 'smtp.hostinger.com',
    smtp_port: String(account?.smtpPort ?? 465),
    password: '',
  };
}

export function EditAccountDialog({
  account,
  open,
  onClose,
}: EditAccountDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditAccountFormState>(buildState(account));
  const [errors, setErrors] = useState<EditAccountErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(buildState(account));
    setErrors({});
    setSubmitting(false);
    setDeleting(false);
  }, [account, open]);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const field = event.target.name as EditAccountField;
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function renderError(field: EditAccountField): JSX.Element | null {
    const message = errors[field];
    if (!message) return null;
    return <p className="text-danger text-xs">{message}</p>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!account) return;

    const parsed = editAccountSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: EditAccountErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          nextErrors[field as EditAccountField] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    const payload: UpdateEmailAccountInput = {
      display_name: parsed.data.display_name?.trim() || undefined,
      imap_host: parsed.data.imap_host,
      imap_port: parsed.data.imap_port,
      smtp_host: parsed.data.smtp_host,
      smtp_port: parsed.data.smtp_port,
    };
    if (form.password.trim()) {
      payload.password = form.password;
    }

    setSubmitting(true);
    try {
      await updateAccount(account.id, payload);
      toast.success('Cuenta actualizada');
      await queryClient.invalidateQueries({ queryKey: ['mail', 'accounts'] });
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo actualizar la cuenta.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!account) return;
    if (!window.confirm('¿Eliminar esta cuenta de correo?')) return;

    setDeleting(true);
    try {
      await deleteAccount(account.id);
      toast.success('Cuenta eliminada');
      await queryClient.invalidateQueries({ queryKey: ['mail', 'accounts'] });
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo eliminar la cuenta.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar cuenta" size="lg">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="edit-mail-display_name" className="block text-sm font-medium">
            Nombre para mostrar
          </label>
          <input
            id="edit-mail-display_name"
            name="display_name"
            value={form.display_name}
            onChange={handleChange}
            disabled={submitting || deleting}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
          />
          {renderError('display_name')}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="edit-mail-imap_host" className="block text-sm font-medium">
              IMAP host
            </label>
            <input
              id="edit-mail-imap_host"
              name="imap_host"
              value={form.imap_host}
              onChange={handleChange}
              disabled={submitting || deleting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderError('imap_host')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-mail-imap_port" className="block text-sm font-medium">
              IMAP puerto
            </label>
            <input
              id="edit-mail-imap_port"
              name="imap_port"
              type="number"
              value={form.imap_port}
              onChange={handleChange}
              disabled={submitting || deleting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderError('imap_port')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-mail-smtp_host" className="block text-sm font-medium">
              SMTP host
            </label>
            <input
              id="edit-mail-smtp_host"
              name="smtp_host"
              value={form.smtp_host}
              onChange={handleChange}
              disabled={submitting || deleting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderError('smtp_host')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-mail-smtp_port" className="block text-sm font-medium">
              SMTP puerto
            </label>
            <input
              id="edit-mail-smtp_port"
              name="smtp_port"
              type="number"
              value={form.smtp_port}
              onChange={handleChange}
              disabled={submitting || deleting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderError('smtp_port')}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-mail-password" className="block text-sm font-medium">
            Nueva contrasena, dejar vacio para no cambiar
          </label>
          <input
            id="edit-mail-password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            disabled={submitting || deleting}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
          />
          {renderError('password')}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting || deleting}
            className="bg-danger h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </button>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting || deleting}
              className="border-border bg-surface-muted h-10 rounded-md border px-4 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || deleting}
              className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

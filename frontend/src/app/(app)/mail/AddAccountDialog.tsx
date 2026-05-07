'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Modal } from '@/components/Modal';
import { createAccount, type CreateEmailAccountInput } from '@/lib/api/mail';
import { ApiError } from '@/lib/api/client';

interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

interface AddAccountFormState {
  email_address: string;
  password: string;
  display_name: string;
  imap_host: string;
  imap_port: string;
  smtp_host: string;
  smtp_port: string;
}

type AddAccountField = keyof AddAccountFormState;
type AddAccountErrors = Partial<Record<AddAccountField, string>>;

const DEFAULT_STATE: AddAccountFormState = {
  email_address: '',
  password: '',
  display_name: '',
  imap_host: 'imap.hostinger.com',
  imap_port: '993',
  smtp_host: 'smtp.hostinger.com',
  smtp_port: '465',
};

const addAccountSchema = z.object({
  email_address: z.string().trim().email('Email inválido'),
  password: z.string().min(1, 'Requerido'),
  display_name: z.string().trim().optional(),
  imap_host: z.string().trim().min(1, 'Requerido'),
  imap_port: z.coerce.number().int().positive('Puerto inválido'),
  smtp_host: z.string().trim().min(1, 'Requerido'),
  smtp_port: z.coerce.number().int().positive('Puerto inválido'),
});

export function AddAccountDialog({ open, onClose }: AddAccountDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddAccountFormState>(DEFAULT_STATE);
  const [errors, setErrors] = useState<AddAccountErrors>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(DEFAULT_STATE);
    setErrors({});
    setAdvancedOpen(false);
    setSubmitting(false);
  }, [open]);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const field = event.target.name as AddAccountField;
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function renderError(field: AddAccountField): JSX.Element | null {
    const message = errors[field];
    if (!message) return null;
    return <p className="text-danger text-xs">{message}</p>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors({});

    const parsed = addAccountSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: AddAccountErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          nextErrors[field as AddAccountField] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    const payload: CreateEmailAccountInput = {
      email_address: parsed.data.email_address,
      password: parsed.data.password,
      display_name: parsed.data.display_name?.trim() || undefined,
      imap_host: parsed.data.imap_host,
      imap_port: parsed.data.imap_port,
      smtp_host: parsed.data.smtp_host,
      smtp_port: parsed.data.smtp_port,
    };

    setSubmitting(true);
    try {
      await createAccount(payload);
      toast.success('Cuenta anadida');
      await queryClient.invalidateQueries({ queryKey: ['mail', 'accounts'] });
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo anadir la cuenta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Anadir cuenta" size="lg">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="mail-email_address" className="block text-sm font-medium">
              Email corporativo
            </label>
            <input
              id="mail-email_address"
              name="email_address"
              type="email"
              value={form.email_address}
              onChange={handleChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderError('email_address')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mail-password" className="block text-sm font-medium">
              Contrasena
            </label>
            <input
              id="mail-password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
            {renderError('password')}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="mail-display_name" className="block text-sm font-medium">
            Nombre para mostrar
          </label>
          <input
            id="mail-display_name"
            name="display_name"
            value={form.display_name}
            onChange={handleChange}
            disabled={submitting}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            placeholder="Opcional"
          />
          {renderError('display_name')}
        </div>

        <div className="border-border rounded-lg border">
          <button
            type="button"
            onClick={() => setAdvancedOpen((current) => !current)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
          >
            <span>Configuracion avanzada</span>
            {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {advancedOpen ? (
            <div className="border-border grid gap-4 border-t p-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="mail-imap_host" className="block text-sm font-medium">
                  IMAP host
                </label>
                <input
                  id="mail-imap_host"
                  name="imap_host"
                  value={form.imap_host}
                  onChange={handleChange}
                  disabled={submitting}
                  className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                />
                {renderError('imap_host')}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mail-imap_port" className="block text-sm font-medium">
                  IMAP puerto
                </label>
                <input
                  id="mail-imap_port"
                  name="imap_port"
                  type="number"
                  value={form.imap_port}
                  onChange={handleChange}
                  disabled={submitting}
                  className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                />
                {renderError('imap_port')}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mail-smtp_host" className="block text-sm font-medium">
                  SMTP host
                </label>
                <input
                  id="mail-smtp_host"
                  name="smtp_host"
                  value={form.smtp_host}
                  onChange={handleChange}
                  disabled={submitting}
                  className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                />
                {renderError('smtp_host')}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mail-smtp_port" className="block text-sm font-medium">
                  SMTP puerto
                </label>
                <input
                  id="mail-smtp_port"
                  name="smtp_port"
                  type="number"
                  value={form.smtp_port}
                  onChange={handleChange}
                  disabled={submitting}
                  className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                />
                {renderError('smtp_port')}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="border-border bg-surface-muted h-10 rounded-md border px-4 text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? 'Guardando...' : 'Anadir cuenta'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

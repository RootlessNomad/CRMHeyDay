'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Modal } from '@/components/Modal';
import { createContact, updateContact } from '@/lib/api/contacts';
import type {
  ConsentStatus,
  ContactCreateInput,
  ContactDto,
  ContactUpdateInput,
} from '@/types/contact';

import { CompanyPicker } from './CompanyPicker';

interface ContactFormDialogProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  contact?: ContactDto;
  onSuccess: (contact: ContactDto) => void;
}

interface CompanySelection {
  id: string;
  name: string;
}

interface ContactFormState {
  first_name: string;
  last_name: string;
  role_title: string;
  email: string;
  phone: string;
  whatsapp: string;
  linkedin_url: string;
  company: CompanySelection | null;
  is_primary: boolean;
  consent_status: ConsentStatus;
}

type ContactField =
  | 'first_name'
  | 'last_name'
  | 'role_title'
  | 'email'
  | 'phone'
  | 'whatsapp'
  | 'linkedin_url'
  | 'company_id'
  | 'is_primary'
  | 'consent_status';
type ContactFormErrors = Partial<Record<ContactField, string>>;

const PHONE_REGEX = /^[+()\d\s-]{3,50}$/;
const CONSENT_STATUSES = [
  'unknown',
  'public_business_data_only',
  'explicit_granted',
  'revoked',
] as const;

const ContactSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, { message: 'Requerido' })
    .max(100, { message: 'Máximo 100 caracteres' }),
  last_name: z.string().max(100, { message: 'Máximo 100 caracteres' }).nullable(),
  role_title: z.string().max(150, { message: 'Máximo 150 caracteres' }).nullable(),
  email: z
    .string()
    .email({ message: 'Email inválido' })
    .max(254, { message: 'Máximo 254 caracteres' })
    .nullable(),
  phone: z
    .string()
    .max(50, { message: 'Máximo 50 caracteres' })
    .regex(PHONE_REGEX, { message: 'Teléfono inválido' })
    .nullable(),
  whatsapp: z
    .string()
    .max(50, { message: 'Máximo 50 caracteres' })
    .regex(PHONE_REGEX, { message: 'WhatsApp inválido' })
    .nullable(),
  linkedin_url: z.string().url({ message: 'URL inválida' }).nullable(),
  company_id: z.string().nullable(),
  is_primary: z.boolean(),
  consent_status: z.enum(CONSENT_STATUSES),
});

const CONSENT_LABELS: Record<ConsentStatus, string> = {
  unknown: 'Desconocido',
  public_business_data_only: 'Solo datos públicos de empresa',
  explicit_granted: 'Consentimiento explícito',
  revoked: 'Revocado',
};

function emptyState(): ContactFormState {
  return {
    first_name: '',
    last_name: '',
    role_title: '',
    email: '',
    phone: '',
    whatsapp: '',
    linkedin_url: '',
    company: null,
    is_primary: false,
    consent_status: 'public_business_data_only',
  };
}

function stateFromContact(contact?: ContactDto): ContactFormState {
  return {
    first_name: contact?.first_name ?? '',
    last_name: contact?.last_name ?? '',
    role_title: contact?.role_title ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    whatsapp: contact?.whatsapp ?? '',
    linkedin_url: contact?.linkedin_url ?? '',
    company: contact?.company_id ? { id: contact.company_id, name: contact.company_id } : null,
    is_primary: contact?.is_primary ?? false,
    consent_status: contact?.consent_status ?? 'public_business_data_only',
  };
}

function normalizeNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sanitizePayload(form: ContactFormState): ContactCreateInput {
  return {
    first_name: form.first_name.trim(),
    last_name: normalizeNullable(form.last_name),
    role_title: normalizeNullable(form.role_title),
    email: normalizeNullable(form.email),
    phone: normalizeNullable(form.phone),
    whatsapp: normalizeNullable(form.whatsapp),
    linkedin_url: normalizeNullable(form.linkedin_url),
    company_id: form.company?.id ?? null,
    is_primary: form.company ? form.is_primary : false,
    consent_status: form.consent_status,
  };
}

export function ContactFormDialog({
  open,
  onClose,
  mode,
  contact,
  onSuccess,
}: ContactFormDialogProps): JSX.Element | null {
  const [form, setForm] = useState<ContactFormState>(emptyState());
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showMoreData, setShowMoreData] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(mode === 'edit' ? stateFromContact(contact) : emptyState());
    setErrors({});
    setSubmitting(false);
    setShowMoreData(false);
  }, [contact, mode, open]);

  function updateField<K extends keyof ContactFormState>(
    field: K,
    value: ContactFormState[K],
  ): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    const field = event.target.name as keyof ContactFormState;
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    updateField(field, value as ContactFormState[typeof field]);
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors({});

    const payload = sanitizePayload(form);
    const parsed = ContactSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: ContactFormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') {
          nextErrors[field as ContactField] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const validPayload: ContactCreateInput = parsed.data;
      const saved =
        mode === 'create'
          ? await createContact(validPayload)
          : await updateContact(contact?.id ?? '', validPayload as ContactUpdateInput);

      toast.success(mode === 'create' ? 'Contacto creado.' : 'Contacto actualizado.');
      onSuccess(saved);
      onClose();
    } catch {
      toast.error('No se pudo guardar el contacto.');
    } finally {
      setSubmitting(false);
    }
  }

  function renderFieldError(field: ContactField): JSX.Element | null {
    const message = errors[field];
    if (!message) return null;
    return <p className="text-danger text-xs">{message}</p>;
  }

  const title = mode === 'create' ? 'Nuevo contacto' : 'Editar contacto';
  const primaryDisabled = !form.company;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="contact-company" className="block text-sm font-medium">
            Empresa
          </label>
          <CompanyPicker
            inputId="contact-company"
            value={form.company}
            onChange={(next) => {
              setForm((current) => ({
                ...current,
                company: next,
                is_primary: next ? current.is_primary : false,
              }));
              setErrors((current) => ({ ...current, company_id: undefined }));
            }}
            disabled={submitting}
            error={errors.company_id}
          />
          <button
            type="button"
            onClick={() => {
              setForm((current) => ({ ...current, company: null, is_primary: false }));
              setErrors((current) => ({ ...current, company_id: undefined }));
            }}
            disabled={submitting}
            className="text-text-muted text-xs underline underline-offset-4"
          >
            Sin empresa
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="contact-first_name" className="block text-sm font-medium">
              Nombre
            </label>
            <input
              id="contact-first_name"
              name="first_name"
              value={form.first_name}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.first_name)}
            />
            {renderFieldError('first_name')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="contact-last_name" className="block text-sm font-medium">
              Apellidos
            </label>
            <input
              id="contact-last_name"
              name="last_name"
              value={form.last_name}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.last_name)}
            />
            {renderFieldError('last_name')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="contact-email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="contact-email"
              name="email"
              value={form.email}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.email)}
            />
            {renderFieldError('email')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="contact-phone" className="block text-sm font-medium">
              Teléfono
            </label>
            <input
              id="contact-phone"
              name="phone"
              value={form.phone}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.phone)}
            />
            {renderFieldError('phone')}
          </div>
        </div>

        <div className="border-border rounded-lg border px-4 py-3">
          <label className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Contacto principal</p>
              <p className="text-text-muted text-xs">
                {primaryDisabled
                  ? 'Necesitas asignar una empresa para marcar como contacto principal'
                  : 'Solo puede haber un contacto principal por empresa.'}
              </p>
            </div>
            <input
              type="checkbox"
              name="is_primary"
              checked={form.is_primary}
              onChange={handleInputChange}
              disabled={submitting || primaryDisabled}
              title={
                primaryDisabled
                  ? 'Necesitas asignar una empresa para marcar como contacto principal'
                  : undefined
              }
              className="accent-accent h-4 w-4"
            />
          </label>
        </div>

        <div className="border-border rounded-lg border">
          <button
            type="button"
            onClick={() => setShowMoreData((current) => !current)}
            className="hover:bg-surface-muted flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-medium transition"
          >
            Más datos
            <span className="text-text-muted text-xs">{showMoreData ? 'Ocultar' : 'Mostrar'}</span>
          </button>

          {showMoreData ? (
            <div className="grid gap-4 border-t px-4 py-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="contact-whatsapp" className="block text-sm font-medium">
                  WhatsApp
                </label>
                <input
                  id="contact-whatsapp"
                  name="whatsapp"
                  value={form.whatsapp}
                  onChange={handleInputChange}
                  disabled={submitting}
                  className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                  aria-invalid={Boolean(errors.whatsapp)}
                />
                {renderFieldError('whatsapp')}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="contact-linkedin_url" className="block text-sm font-medium">
                  LinkedIn URL
                </label>
                <input
                  id="contact-linkedin_url"
                  name="linkedin_url"
                  value={form.linkedin_url}
                  onChange={handleInputChange}
                  disabled={submitting}
                  className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                  aria-invalid={Boolean(errors.linkedin_url)}
                />
                {renderFieldError('linkedin_url')}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="contact-role_title" className="block text-sm font-medium">
                  Cargo
                </label>
                <input
                  id="contact-role_title"
                  name="role_title"
                  value={form.role_title}
                  onChange={handleInputChange}
                  disabled={submitting}
                  className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                  aria-invalid={Boolean(errors.role_title)}
                />
                {renderFieldError('role_title')}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="contact-consent_status" className="block text-sm font-medium">
                  Consentimiento
                </label>
                <select
                  id="contact-consent_status"
                  name="consent_status"
                  value={form.consent_status}
                  onChange={handleInputChange}
                  disabled={submitting}
                  className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                >
                  {Object.entries(CONSENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {renderFieldError('consent_status')}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : mode === 'create' ? 'Crear contacto' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

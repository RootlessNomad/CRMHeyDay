'use client';

import Link from 'next/link';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Modal } from '@/components/Modal';
import { TagPicker } from '@/components/tags/TagPicker';
import { createCompany, isCompanyDomainConflict, updateCompany } from '@/lib/api/companies';
import { ApiError } from '@/lib/api/client';
import {
  ICP_VERTICALS,
  SIZE_SIGNALS,
  type CompanyCreateInput,
  type CompanyDto,
  type IcpVertical,
  type SizeSignal,
} from '@/types/company';

interface CompanyFormDialogProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  initialValues?: Partial<CompanyDto> | null;
  onSuccess: (company: CompanyDto) => void;
}

interface CompanyFormState {
  name: string;
  website: string;
  domain: string;
  industry: string;
  icp_vertical: '' | IcpVertical;
  country: string;
  region: string;
  city: string;
  postal_code: string;
  address: string;
  size_signal: '' | SizeSignal;
  phone: string;
  email: string;
  notes: string;
  whatsapp: string;
  linkedin_url: string;
  instagram_handle: string;
  demo_link: string;
}

type CompanyField = keyof CompanyFormState;
type CompanyFormErrors = Partial<Record<CompanyField, string>>;

interface ValidationIssue {
  path?: unknown[];
  message?: string;
}

const CompanySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Requerido' })
    .max(200, { message: 'Máximo 200 caracteres' }),
  website: z.string().url({ message: 'URL inválida' }).nullable(),
  domain: z.string().max(253, { message: 'Máximo 253 caracteres' }).nullable(),
  industry: z.string().max(100, { message: 'Máximo 100 caracteres' }).nullable(),
  icp_vertical: z.enum(ICP_VERTICALS).nullable(),
  country: z.string().length(2, { message: 'Usa código ISO de 2 letras' }),
  region: z.string().max(100, { message: 'Máximo 100 caracteres' }).nullable(),
  city: z.string().max(100, { message: 'Máximo 100 caracteres' }).nullable(),
  postal_code: z.string().max(20, { message: 'Máximo 20 caracteres' }).nullable(),
  address: z.string().max(300, { message: 'Máximo 300 caracteres' }).nullable(),
  size_signal: z.enum(['solo', 'micro_1_5', 'small_6_25', 'mid_26_100', 'unknown']).nullable(),
  phone: z.string().max(50, { message: 'Máximo 50 caracteres' }).nullable(),
  email: z
    .string()
    .email({ message: 'Email inválido' })
    .max(254, { message: 'Máximo 254 caracteres' })
    .nullable(),
  notes: z.string().max(5000, { message: 'Máximo 5000 caracteres' }).nullable(),
  whatsapp: z.string().max(50, { message: 'Máximo 50 caracteres' }).nullable(),
  linkedin_url: z.string().url({ message: 'URL inválida' }).nullable(),
  instagram_handle: z.string().max(100, { message: 'Máximo 100 caracteres' }).nullable(),
  demo_link: z.string().url({ message: 'URL inválida' }).nullable(),
});

const VERTICAL_LABELS: Record<IcpVertical, string> = {
  physiotherapy: 'Fisioterapia',
  pilates: 'Pilates',
  yoga: 'Yoga',
  gym_fitness: 'Gym & Fitness',
  bakery: 'Panadería',
  cafe: 'Cafetería',
  other: 'Otro',
};

const SIZE_LABELS: Record<SizeSignal, string> = {
  solo: 'Solo',
  micro_1_5: 'Micro 1-5',
  small_6_25: 'Small 6-25',
  mid_26_100: 'Mid 26-100',
  unknown: 'Desconocido',
};

function emptyState(): CompanyFormState {
  return {
    name: '',
    website: '',
    domain: '',
    industry: '',
    icp_vertical: '',
    country: 'ES',
    region: '',
    city: '',
    postal_code: '',
    address: '',
    size_signal: '',
    phone: '',
    email: '',
    notes: '',
    whatsapp: '',
    linkedin_url: '',
    instagram_handle: '',
    demo_link: '',
  };
}

function stateFromInitialValues(initialValues?: Partial<CompanyDto> | null): CompanyFormState {
  return {
    name: initialValues?.name ?? '',
    website: initialValues?.website ?? '',
    domain: initialValues?.domain ?? '',
    industry: initialValues?.industry ?? '',
    icp_vertical: initialValues?.icp_vertical ?? '',
    country: initialValues?.country ?? 'ES',
    region: initialValues?.region ?? '',
    city: initialValues?.city ?? '',
    postal_code: initialValues?.postal_code ?? '',
    address: initialValues?.address ?? '',
    size_signal: initialValues?.size_signal ?? '',
    phone: initialValues?.phone ?? '',
    email: initialValues?.email ?? '',
    notes: initialValues?.notes ?? '',
    whatsapp: initialValues?.whatsapp ?? '',
    linkedin_url: initialValues?.linkedin_url ?? '',
    instagram_handle: initialValues?.instagram_handle ?? '',
    demo_link: initialValues?.demo_link ?? '',
  };
}

function normalizeNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sanitizePayload(state: CompanyFormState): CompanyCreateInput {
  return {
    name: state.name.trim(),
    website: normalizeNullable(state.website),
    domain: normalizeNullable(state.domain),
    industry: normalizeNullable(state.industry),
    icp_vertical: state.icp_vertical || null,
    country: state.country.trim().toUpperCase() || 'ES',
    region: normalizeNullable(state.region),
    city: normalizeNullable(state.city),
    postal_code: normalizeNullable(state.postal_code),
    address: normalizeNullable(state.address),
    size_signal: state.size_signal || null,
    phone: normalizeNullable(state.phone),
    email: normalizeNullable(state.email),
    notes: normalizeNullable(state.notes),
    whatsapp: normalizeNullable(state.whatsapp),
    linkedin_url: normalizeNullable(state.linkedin_url),
    instagram_handle: normalizeNullable(state.instagram_handle),
    demo_link: normalizeNullable(state.demo_link),
  };
}

function collectFieldErrors(issues: ValidationIssue[]): CompanyFormErrors {
  const errors: CompanyFormErrors = {};

  for (const issue of issues) {
    const field = issue.path?.[0];
    if (typeof field !== 'string' || !issue.message) continue;
    if (field in emptyState()) {
      errors[field as CompanyField] = issue.message;
    }
  }

  return errors;
}

export function CompanyFormDialog({
  open,
  onClose,
  mode,
  initialValues,
  onSuccess,
}: CompanyFormDialogProps): JSX.Element | null {
  const [form, setForm] = useState<CompanyFormState>(emptyState());
  const [errors, setErrors] = useState<CompanyFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showMoreData, setShowMoreData] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(mode === 'edit' ? stateFromInitialValues(initialValues) : emptyState());
    setErrors({});
    setSubmitting(false);
    setShowMoreData(false);
  }, [initialValues, mode, open]);

  function updateField<K extends CompanyField>(field: K, value: CompanyFormState[K]): void {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ): void {
    const field = event.target.name as CompanyField;
    updateField(field, event.target.value as CompanyFormState[typeof field]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors({});

    const payload = sanitizePayload(form);
    const parsed = CompanySchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(collectFieldErrors(parsed.error.issues));
      return;
    }

    setSubmitting(true);
    try {
      const validPayload: CompanyCreateInput = parsed.data;
      const company =
        mode === 'create'
          ? await createCompany(validPayload)
          : await updateCompany(initialValues?.id ?? '', validPayload);
      onSuccess(company);
    } catch (err) {
      if (isCompanyDomainConflict(err)) {
        toast.error('Ya existe una empresa con ese dominio.', {
          description: (
            <Link href={`/companies/${err.details.existing_id}`} className="underline">
              Ver empresa existente
            </Link>
          ),
        });
        return;
      }

      if (err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION_ERROR') {
        const details = Array.isArray(err.details) ? (err.details as ValidationIssue[]) : [];
        const fieldErrors = collectFieldErrors(details);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          return;
        }
      }

      toast.error('No se pudo guardar la empresa.');
    } finally {
      setSubmitting(false);
    }
  }

  function renderFieldError(field: CompanyField): JSX.Element | null {
    const message = errors[field];
    if (!message) return null;
    return <p className="text-danger text-xs">{message}</p>;
  }

  const title = mode === 'create' ? 'Nueva empresa' : 'Editar empresa';

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="company-name" className="block text-sm font-medium">
              Nombre
            </label>
            <input
              id="company-name"
              name="name"
              value={form.name}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
              aria-invalid={Boolean(errors.name)}
            />
            {renderFieldError('name')}
          </div>

          {[
            ['website', 'Website'],
            ['domain', 'Dominio'],
            ['industry', 'Industria'],
            ['country', 'País'],
            ['region', 'Región'],
            ['city', 'Ciudad'],
            ['postal_code', 'Código postal'],
            ['address', 'Dirección'],
            ['phone', 'Teléfono'],
            ['email', 'Email'],
          ].map(([field, label]) => (
            <div
              key={field}
              className={field === 'address' ? 'space-y-1.5 md:col-span-2' : 'space-y-1.5'}
            >
              <label htmlFor={`company-${field}`} className="block text-sm font-medium">
                {label}
              </label>
              <input
                id={`company-${field}`}
                name={field}
                value={form[field as CompanyField]}
                onChange={handleInputChange}
                disabled={submitting}
                className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                aria-invalid={Boolean(errors[field as CompanyField])}
              />
              {renderFieldError(field as CompanyField)}
            </div>
          ))}

          <div className="space-y-1.5">
            <label htmlFor="company-icp_vertical" className="block text-sm font-medium">
              Vertical ICP
            </label>
            <select
              id="company-icp_vertical"
              name="icp_vertical"
              value={form.icp_vertical}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            >
              <option value="">Sin definir</option>
              {ICP_VERTICALS.map((vertical) => (
                <option key={vertical} value={vertical}>
                  {VERTICAL_LABELS[vertical]}
                </option>
              ))}
            </select>
            {renderFieldError('icp_vertical')}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="company-size_signal" className="block text-sm font-medium">
              Tamaño
            </label>
            <select
              id="company-size_signal"
              name="size_signal"
              value={form.size_signal}
              onChange={handleInputChange}
              disabled={submitting}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            >
              <option value="">Sin definir</option>
              {SIZE_SIGNALS.map((sizeSignal) => (
                <option key={sizeSignal} value={sizeSignal}>
                  {SIZE_LABELS[sizeSignal]}
                </option>
              ))}
            </select>
            {renderFieldError('size_signal')}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="company-notes" className="block text-sm font-medium">
              Notas
            </label>
            <textarea
              id="company-notes"
              name="notes"
              value={form.notes}
              onChange={handleInputChange}
              disabled={submitting}
              rows={4}
              className="border-border bg-bg focus:border-accent w-full rounded-sm border px-3 py-2 text-sm outline-none transition"
            />
            {renderFieldError('notes')}
          </div>
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
              {[
                ['whatsapp', 'WhatsApp'],
                ['linkedin_url', 'LinkedIn URL'],
                ['instagram_handle', 'Instagram'],
                ['demo_link', 'Demo (URL)'],
              ].map(([field, label]) => (
                <div key={field} className="space-y-1.5">
                  <label htmlFor={`company-${field}`} className="block text-sm font-medium">
                    {label}
                  </label>
                  <input
                    id={`company-${field}`}
                    name={field}
                    value={form[field as CompanyField]}
                    onChange={handleInputChange}
                    disabled={submitting}
                    className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
                    aria-invalid={Boolean(errors[field as CompanyField])}
                  />
                  {renderFieldError(field as CompanyField)}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="border-border bg-surface space-y-3 rounded-lg border px-4 py-4">
          <h3 className="text-sm font-medium">Tags</h3>
          <TagPicker
            entityType="company"
            entityId={mode === 'edit' ? (initialValues?.id ?? null) : null}
          />
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
            {submitting ? 'Guardando…' : mode === 'create' ? 'Crear empresa' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

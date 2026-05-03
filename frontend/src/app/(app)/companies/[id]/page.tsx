'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { ActivityFeed } from '@/components/activities/ActivityFeed';
import { CompanyFormDialog } from '@/components/companies/CompanyFormDialog';
import { DeleteCompanyDialog } from '@/components/companies/DeleteCompanyDialog';
import { ServiceFitList } from '@/components/intel/ServiceFitList';
import { Tabs, TabsList, TabsPanel, TabsTrigger } from '@/components/Tabs';
import { getCompany } from '@/lib/api/companies';
import { ApiError } from '@/lib/api/client';
import { type CompanyDto, type IcpVertical, type SizeSignal } from '@/types/company';

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

function formatRelativeDate(input: string): string {
  const date = new Date(input);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, 'day');
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return formatter.format(diffMonths, 'month');
  return formatter.format(Math.round(diffMonths / 12), 'year');
}

// Defensa contra `javascript:` u otros schemes peligrosos en URLs guardadas.
// Zod `.url()` acepta cualquier scheme válido; sólo dejamos navegar a http(s).
function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    return null;
  } catch {
    return null;
  }
}

function formatValue(
  field: keyof CompanyDto,
  value: CompanyDto[keyof CompanyDto],
): JSX.Element | string {
  if (value === null || value === '') return '—';
  if (field === 'website' || field === 'linkedin_url') {
    const safe = safeHttpUrl(String(value));
    if (!safe) return String(value); // muestra texto plano si el scheme no es http(s)
    return (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        {value}
      </a>
    );
  }
  if (field === 'domain') {
    return (
      <a
        href={`https://${String(value)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        {value}
      </a>
    );
  }
  if (field === 'email') {
    return (
      <a href={`mailto:${String(value)}`} className="underline underline-offset-4">
        {value}
      </a>
    );
  }
  if (field === 'phone' || field === 'whatsapp') {
    return (
      <a href={`tel:${String(value)}`} className="underline underline-offset-4">
        {value}
      </a>
    );
  }
  if (field === 'icp_vertical') {
    return VERTICAL_LABELS[value as IcpVertical];
  }
  if (field === 'size_signal') {
    return SIZE_LABELS[value as SizeSignal];
  }
  return String(value);
}

function PlaceholderTab({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Users;
  title: string;
  subtitle: string;
}): JSX.Element {
  return (
    <div className="border-border bg-surface rounded-lg border p-8 text-center shadow-sm">
      <Icon className="text-text-muted mx-auto mb-3 h-10 w-10" />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-text-muted mt-1 text-sm">{subtitle}</p>
    </div>
  );
}

export default function CompanyDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const companyId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const companyQuery = useQuery({
    queryKey: ['companies', companyId],
    queryFn: () => getCompany(companyId),
  });

  async function handleEdited(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['companies', companyId] });
    await queryClient.invalidateQueries({ queryKey: ['companies'] });
    setEditOpen(false);
  }

  async function handleDeleted(): Promise<void> {
    setDeleteOpen(false);
    await queryClient.invalidateQueries({ queryKey: ['companies'] });
    router.replace('/companies');
    toast.success('Empresa eliminada');
  }

  if (companyQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-3">
          <div className="bg-surface-muted h-10 w-64 animate-pulse rounded-md" />
          <div className="bg-surface-muted h-5 w-48 animate-pulse rounded-md" />
        </div>
        <div className="border-border bg-surface rounded-lg border p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="bg-surface-muted h-16 animate-pulse rounded-md" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (companyQuery.isError) {
    const error = companyQuery.error;
    const isNotFound = error instanceof ApiError && error.status === 404;

    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="border-border bg-surface rounded-lg border p-6 shadow-sm">
          <h1 className="text-xl font-semibold">
            {isNotFound
              ? 'Esta empresa no existe o fue eliminada.'
              : 'No se pudo cargar la empresa.'}
          </h1>
          <Link href="/companies" className="mt-3 inline-flex text-sm underline underline-offset-4">
            Volver a empresas
          </Link>
        </div>
      </div>
    );
  }

  const company = companyQuery.data;
  if (!company) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="border-border bg-surface rounded-lg border p-6 shadow-sm">
          <h1 className="text-xl font-semibold">No se pudo cargar la empresa.</h1>
          <Link href="/companies" className="mt-3 inline-flex text-sm underline underline-offset-4">
            Volver a empresas
          </Link>
        </div>
      </div>
    );
  }
  const overviewFields: Array<{ label: string; field: keyof CompanyDto; wide?: boolean }> = [
    { label: 'ID', field: 'id' },
    { label: 'Nombre', field: 'name' },
    { label: 'Website', field: 'website' },
    { label: 'Dominio', field: 'domain' },
    { label: 'Industria', field: 'industry' },
    { label: 'Vertical ICP', field: 'icp_vertical' },
    { label: 'País', field: 'country' },
    { label: 'Región', field: 'region' },
    { label: 'Ciudad', field: 'city' },
    { label: 'Código postal', field: 'postal_code' },
    { label: 'Dirección', field: 'address' },
    { label: 'Tamaño', field: 'size_signal' },
    { label: 'Teléfono', field: 'phone' },
    { label: 'Email', field: 'email' },
    { label: 'WhatsApp', field: 'whatsapp' },
    { label: 'LinkedIn', field: 'linkedin_url' },
    { label: 'Instagram', field: 'instagram_handle' },
    { label: 'Creada por', field: 'created_by_id' },
    { label: 'Creada', field: 'created_at' },
    { label: 'Actualizada', field: 'updated_at' },
    { label: 'Notas', field: 'notes', wide: true },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{company.name}</h1>
          {company.domain ? (
            <a
              href={`https://${company.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-muted mt-2 inline-flex text-sm underline underline-offset-4"
            >
              {company.domain}
            </a>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {company.icp_vertical ? (
              <span className="bg-accent-soft rounded-full px-2.5 py-1 text-xs font-medium">
                {VERTICAL_LABELS[company.icp_vertical]}
              </span>
            ) : null}
            {company.size_signal ? (
              <span className="bg-surface-muted rounded-full px-2.5 py-1 text-xs font-medium">
                {SIZE_LABELS[company.size_signal]}
              </span>
            ) : null}
            <span className="bg-surface-muted text-text-muted rounded-full px-2.5 py-1 text-xs font-medium">
              Actualizado {formatRelativeDate(company.updated_at)}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="border-border bg-surface-muted h-10 rounded-md border px-4 text-sm font-medium"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="bg-danger h-10 rounded-md px-4 text-sm font-medium text-white"
          >
            Eliminar
          </button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contactos</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="service-fit">Service Fit</TabsTrigger>
          <TabsTrigger value="activity">Actividad</TabsTrigger>
        </TabsList>

        <TabsPanel value="overview">
          <div className="border-border bg-surface rounded-lg border p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              {overviewFields.map(({ label, field, wide }) => (
                <div key={field} className={wide ? 'md:col-span-2' : ''}>
                  <p className="text-text-muted text-xs uppercase tracking-wide">{label}</p>
                  <div className="mt-1 text-sm leading-6">{formatValue(field, company[field])}</div>
                </div>
              ))}
            </div>
          </div>
        </TabsPanel>

        <TabsPanel value="contacts">
          <PlaceholderTab
            icon={Users}
            title="Contactos pendientes"
            subtitle="Disponible al completar UJ-03."
          />
        </TabsPanel>

        <TabsPanel value="leads">
          <PlaceholderTab
            icon={Target}
            title="Leads pendientes"
            subtitle="Disponible al completar UJ-04."
          />
        </TabsPanel>

        <TabsPanel value="service-fit">
          <ServiceFitList companyId={company.id} />
        </TabsPanel>

        <TabsPanel value="activity">
          <ActivityFeed entityType="company" entityId={company.id} />
        </TabsPanel>
      </Tabs>

      <CompanyFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        initialValues={company}
        onSuccess={() => {
          void handleEdited();
        }}
      />

      <DeleteCompanyDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        company={company}
        onDeleted={() => {
          void handleDeleted();
        }}
      />
    </div>
  );
}

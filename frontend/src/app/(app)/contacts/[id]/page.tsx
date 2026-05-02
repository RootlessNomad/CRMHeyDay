'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { ActivityFeed } from '@/components/activities/ActivityFeed';
import { Tabs, TabsList, TabsPanel, TabsTrigger } from '@/components/Tabs';
import { AnonymizeContactDialog } from '@/components/contacts/AnonymizeContactDialog';
import { ContactFormDialog } from '@/components/contacts/ContactFormDialog';
import { DeleteContactDialog } from '@/components/contacts/DeleteContactDialog';
import { getContact } from '@/lib/api/contacts';
import { exportContactData } from '@/lib/api/gdpr';
import { ApiError } from '@/lib/api/client';
import type { ConsentStatus, ContactDto } from '@/types/contact';

const CONSENT_LABELS: Record<ConsentStatus, string> = {
  unknown: 'Desconocido',
  public_business_data_only: 'Solo datos públicos de empresa',
  explicit_granted: 'Consentimiento explícito',
  revoked: 'Revocado',
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

function contactName(contact: Pick<ContactDto, 'first_name' | 'last_name'>): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.first_name;
}

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
  field: keyof ContactDto,
  value: ContactDto[keyof ContactDto],
): JSX.Element | string {
  if (value === null || value === '') return '—';
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
  if (field === 'linkedin_url') {
    const safe = safeHttpUrl(String(value));
    if (!safe) return String(value);
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
  if (field === 'consent_status') {
    return CONSENT_LABELS[value as ConsentStatus];
  }
  return String(value);
}

function PlaceholderTab({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
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

export default function ContactDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const contactId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);

  const contactQuery = useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => getContact(contactId),
  });

  async function handleEdited(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['contact', contactId] });
    await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    setEditOpen(false);
  }

  async function handleDeleted(): Promise<void> {
    setDeleteOpen(false);
    await queryClient.invalidateQueries({ queryKey: ['contact', contactId] });
    await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    router.replace('/contacts');
    toast.success('Contacto eliminado');
  }

  async function handleAnonymized(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['contact', contactId] });
    await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    setAnonymizeOpen(false);
  }

  if (contactQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-3">
          <div className="bg-surface-muted h-10 w-64 animate-pulse rounded-md" />
          <div className="bg-surface-muted h-5 w-48 animate-pulse rounded-md" />
        </div>
        <div className="border-border bg-surface rounded-lg border p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="bg-surface-muted h-16 animate-pulse rounded-md" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (contactQuery.isError) {
    const error = contactQuery.error;
    const isNotFound = error instanceof ApiError && error.status === 404;

    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="border-border bg-surface rounded-lg border p-6 shadow-sm">
          <h1 className="text-xl font-semibold">
            {isNotFound ? 'Contacto no encontrado' : 'No se pudo cargar el contacto.'}
          </h1>
          <Link href="/contacts" className="mt-3 inline-flex text-sm underline underline-offset-4">
            Volver a la lista
          </Link>
        </div>
      </div>
    );
  }

  const contact = contactQuery.data;
  if (!contact) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="border-border bg-surface rounded-lg border p-6 shadow-sm">
          <h1 className="text-xl font-semibold">No se pudo cargar el contacto.</h1>
          <Link href="/contacts" className="mt-3 inline-flex text-sm underline underline-offset-4">
            Volver a la lista
          </Link>
        </div>
      </div>
    );
  }

  const overviewFields: Array<{ label: string; field: keyof ContactDto }> = [
    { label: 'ID', field: 'id' },
    { label: 'Nombre', field: 'first_name' },
    { label: 'Apellidos', field: 'last_name' },
    { label: 'Cargo', field: 'role_title' },
    { label: 'Email', field: 'email' },
    { label: 'Teléfono', field: 'phone' },
    { label: 'WhatsApp', field: 'whatsapp' },
    { label: 'LinkedIn', field: 'linkedin_url' },
    { label: 'Contacto principal', field: 'is_primary' },
    { label: 'Consentimiento', field: 'consent_status' },
    { label: 'Creado por', field: 'created_by_id' },
    { label: 'Creado', field: 'created_at' },
    { label: 'Actualizado', field: 'updated_at' },
    { label: 'Anonimizado', field: 'anonymized_at' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{contactName(contact)}</h1>
            {contact.anonymized_at ? (
              <span className="bg-surface-muted rounded-full px-2.5 py-1 text-xs font-medium">
                Anonimizado
              </span>
            ) : null}
            {contact.is_primary ? (
              <span className="bg-accent-soft rounded-full px-2.5 py-1 text-xs font-medium">
                Primary
              </span>
            ) : null}
          </div>

          {contact.company_id ? (
            <Link
              href={`/companies/${contact.company_id}`}
              className="text-text-muted mt-2 inline-flex text-sm underline underline-offset-4"
            >
              Empresa: {contact.company_id}
            </Link>
          ) : (
            <p className="text-text-muted mt-2 text-sm">Sin empresa asignada</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="bg-surface-muted text-text-muted rounded-full px-2.5 py-1 text-xs font-medium">
              Actualizado {formatRelativeDate(contact.updated_at)}
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
          {!contact.anonymized_at ? (
            <button
              type="button"
              onClick={() => setAnonymizeOpen(true)}
              className="border-border bg-surface-muted h-10 rounded-md border px-4 text-sm font-medium"
            >
              Anonimizar
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              exportContactData(contact.id).catch(() => {
                toast.error('No se pudo exportar los datos del contacto.');
              });
            }}
            className="border-border bg-surface-muted h-10 rounded-md border px-4 text-sm font-medium"
          >
            Exportar datos
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

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="activity">Actividad</TabsTrigger>
        </TabsList>

        <TabsPanel value="summary">
          <div className="border-border bg-surface rounded-lg border p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              {overviewFields.map(({ label, field }) => (
                <div key={field}>
                  <p className="text-text-muted text-xs uppercase tracking-wide">{label}</p>
                  <div className="mt-1 text-sm leading-6">
                    {field === 'company_id' ? (
                      contact.company_id ? (
                        <Link
                          href={`/companies/${contact.company_id}`}
                          className="underline underline-offset-4"
                        >
                          {contact.company_id}
                        </Link>
                      ) : (
                        '—'
                      )
                    ) : field === 'is_primary' ? (
                      contact.is_primary ? (
                        'Sí'
                      ) : (
                        'No'
                      )
                    ) : (
                      formatValue(field, contact[field])
                    )}
                  </div>
                </div>
              ))}

              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide">Empresa</p>
                <div className="mt-1 text-sm leading-6">
                  {contact.company_id ? (
                    <Link
                      href={`/companies/${contact.company_id}`}
                      className="underline underline-offset-4"
                    >
                      {contact.company_id}
                    </Link>
                  ) : (
                    '—'
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsPanel>

        <TabsPanel value="leads">
          <PlaceholderTab icon={Target} title="Leads pendientes" subtitle="Próximamente UJ-04." />
        </TabsPanel>

        <TabsPanel value="activity">
          <ActivityFeed entityType="contact" entityId={contact.id} />
        </TabsPanel>
      </Tabs>

      <ContactFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        contact={contact}
        onSuccess={() => {
          void handleEdited();
        }}
      />

      <DeleteContactDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        contact={contact}
        onDeleted={() => {
          void handleDeleted();
        }}
      />

      <AnonymizeContactDialog
        open={anonymizeOpen}
        onClose={() => setAnonymizeOpen(false)}
        contact={contact}
        onAnonymized={() => {
          void handleAnonymized();
        }}
      />
    </div>
  );
}

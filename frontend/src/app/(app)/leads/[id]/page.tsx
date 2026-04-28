'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type CSSProperties } from 'react';

import { Tabs, TabsList, TabsPanel, TabsTrigger } from '@/components/Tabs';
import { DeleteLeadDialog } from '@/components/leads/DeleteLeadDialog';
import { LeadFormDialog } from '@/components/leads/LeadFormDialog';
import { LostLeadDialog } from '@/components/leads/LostLeadDialog';
import { MoveStageDialog } from '@/components/leads/MoveStageDialog';
import { WonLeadDialog } from '@/components/leads/WonLeadDialog';
import { getLead } from '@/lib/api/leads';
import { ApiError } from '@/lib/api/client';
import { listPipelines } from '@/lib/api/pipelines';

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

function stageBadgeStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  return {
    borderColor: color,
    backgroundColor: `${color}22`,
    color,
  };
}

export default function LeadDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const leadId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const leadQuery = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => getLead(leadId),
  });
  const pipelinesQuery = useQuery({
    queryKey: ['pipelines'],
    queryFn: listPipelines,
  });

  async function invalidateLead(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
    await queryClient.invalidateQueries({ queryKey: ['leads'] });
  }

  if (leadQuery.isLoading) {
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

  if (leadQuery.isError) {
    const error = leadQuery.error;
    const isNotFound = error instanceof ApiError && error.status === 404;

    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="border-border bg-surface rounded-lg border p-6 shadow-sm">
          <h1 className="text-xl font-semibold">
            {isNotFound ? 'Lead no encontrado' : 'No se pudo cargar el lead.'}
          </h1>
          <Link href="/leads" className="mt-3 inline-flex text-sm underline underline-offset-4">
            Volver a leads
          </Link>
        </div>
      </div>
    );
  }

  const lead = leadQuery.data;
  if (!lead) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="border-border bg-surface rounded-lg border p-6 shadow-sm">
          <h1 className="text-xl font-semibold">No se pudo cargar el lead.</h1>
          <Link href="/leads" className="mt-3 inline-flex text-sm underline underline-offset-4">
            Volver a leads
          </Link>
        </div>
      </div>
    );
  }

  const pipeline = pipelinesQuery.data?.find((item) => item.id === lead.pipelineId) ?? null;

  const overview = [
    { label: 'ID', value: lead.id },
    { label: 'Empresa', value: lead.company?.name ?? lead.companyId },
    { label: 'Pipeline', value: lead.pipeline?.name ?? lead.pipelineId },
    {
      label: 'Contacto',
      value:
        [lead.primaryContact?.firstName, lead.primaryContact?.lastName].filter(Boolean).join(' ') ||
        '—',
    },
    { label: 'Owner', value: lead.owner?.name ?? lead.ownerId },
    { label: 'Status', value: lead.status },
    { label: 'Stage', value: lead.stage?.name ?? lead.stageId },
    { label: 'Prioridad score', value: String(lead.priorityScore) },
    {
      label: 'Prioridad manual',
      value: lead.priorityManual === null ? '—' : String(lead.priorityManual),
    },
    {
      label: 'Próxima acción',
      value: lead.nextActionAt ? new Date(lead.nextActionAt).toLocaleString('es-ES') : '—',
    },
    { label: 'Motivo pérdida', value: lead.lostReason ?? '—' },
    { label: 'Actualizado', value: new Date(lead.updatedAt).toLocaleString('es-ES') },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {lead.company?.name ?? lead.companyId}
            </h1>
            {lead.stage ? (
              <span
                className="border-border inline-flex rounded-full border px-2.5 py-1 text-xs font-medium"
                style={stageBadgeStyle(lead.stage.color)}
              >
                {lead.stage.name}
              </span>
            ) : null}
            <span className="bg-surface-muted rounded-full px-2.5 py-1 text-xs font-medium">
              {lead.status}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="bg-surface-muted rounded-full px-2.5 py-1 text-xs font-medium">
              Owner: {lead.owner?.name ?? lead.ownerId}
            </span>
            <span className="bg-surface-muted rounded-full px-2.5 py-1 text-xs font-medium">
              Prioridad: {lead.priorityScore}
            </span>
            <span className="bg-surface-muted rounded-full px-2.5 py-1 text-xs font-medium">
              Próxima acción: {lead.nextActionAt ? formatRelativeDate(lead.nextActionAt) : '—'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="border-border bg-surface-muted h-10 rounded-md border px-4 text-sm font-medium"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => setMoveOpen(true)}
            className="border-border bg-surface-muted h-10 rounded-md border px-4 text-sm font-medium"
          >
            Mover stage
          </button>
          <button
            type="button"
            onClick={() => setWonOpen(true)}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white"
          >
            Won
          </button>
          <button
            type="button"
            onClick={() => setLostOpen(true)}
            className="bg-danger h-10 rounded-md px-4 text-sm font-medium text-white"
          >
            Lost
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="border-border h-10 rounded-md border px-4 text-sm font-medium"
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="border-border bg-surface rounded-lg border p-5 shadow-sm">
        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Resumen</TabsTrigger>
            <TabsTrigger value="activity">Actividad</TabsTrigger>
          </TabsList>

          <TabsPanel value="summary">
            <div className="grid gap-4 md:grid-cols-2">
              {overview.map((item) => (
                <div
                  key={item.label}
                  className="border-border bg-surface-muted rounded-lg border p-4"
                >
                  <p className="text-text-muted text-xs uppercase tracking-wide">{item.label}</p>
                  <p className="mt-2 text-sm">{item.value}</p>
                </div>
              ))}
            </div>
          </TabsPanel>

          <TabsPanel value="activity">
            <div className="border-border bg-surface-muted rounded-lg border p-8 text-center shadow-sm">
              <h2 className="text-lg font-semibold">Actividad</h2>
              <p className="text-text-muted mt-1 text-sm">Disponible en UJ-05</p>
            </div>
          </TabsPanel>
        </Tabs>
      </div>

      <LeadFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        lead={lead}
        onSuccess={(_lead) => {
          void invalidateLead();
          setEditOpen(false);
        }}
      />

      <MoveStageDialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        lead={lead}
        pipeline={pipeline}
        onSuccess={(_lead) => {
          void invalidateLead();
          setMoveOpen(false);
        }}
        onRequestWon={() => setWonOpen(true)}
        onRequestLost={() => setLostOpen(true)}
      />

      <WonLeadDialog
        open={wonOpen}
        onClose={() => setWonOpen(false)}
        leadId={lead.id}
        onSuccess={() => {
          void invalidateLead();
          setWonOpen(false);
        }}
      />

      <LostLeadDialog
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        leadId={lead.id}
        onSuccess={() => {
          void invalidateLead();
          setLostOpen(false);
        }}
      />

      <DeleteLeadDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        lead={lead}
        onSuccess={() => {
          void invalidateLead();
          router.replace('/leads');
        }}
      />
    </div>
  );
}

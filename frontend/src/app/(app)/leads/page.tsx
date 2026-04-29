'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { LeadFormDialog } from '@/components/leads/LeadFormDialog';
import { LeadList } from '@/components/leads/LeadList';
import { MoveStageDialog } from '@/components/leads/MoveStageDialog';
import { KanbanBoard } from '@/components/leads/KanbanBoard';
import { WonLeadDialog } from '@/components/leads/WonLeadDialog';
import { LostLeadDialog } from '@/components/leads/LostLeadDialog';
import { DeleteLeadDialog } from '@/components/leads/DeleteLeadDialog';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { useAuthStore } from '@/lib/auth/store';
import { listLeads, updateLead } from '@/lib/api/leads';
import { listPipelines } from '@/lib/api/pipelines';
import type { LeadDto, LeadListQuery } from '@/types/lead';
import type { PipelineDto } from '@/types/pipeline';

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
}

type LeadView = 'kanban' | 'list';
type LeadStatusFilter = 'open' | 'won' | 'lost' | '';

function buildSearchParams(query: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (key === 'page' && value === 1) ||
      (key === 'pageSize' && value === 20) ||
      (key === 'view' && value === 'list')
    ) {
      continue;
    }
    params.set(key, String(value));
  }

  return params.toString();
}

function ownerLabel(lead: LeadDto): string {
  return lead.owner?.name ?? lead.ownerId;
}

function resolveDefaultPipeline(pipelines: PipelineDto[]): PipelineDto | null {
  if (pipelines.length === 0) return null;
  return (
    pipelines.find((pipeline) => pipeline.isDefault) ??
    [...pipelines].sort((a, b) => a.name.localeCompare(b.name))[0] ??
    null
  );
}

export default function LeadsPage(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const { saveFilters, loadFilters, clearFilters } = usePersistedFilters('leads', currentUser?.id);

  const [createOpen, setCreateOpen] = useState(false);
  const [editLead, setEditLead] = useState<LeadDto | null>(null);
  const [moveLead, setMoveLead] = useState<LeadDto | null>(null);
  const [wonLead, setWonLead] = useState<LeadDto | null>(null);
  const [lostLead, setLostLead] = useState<LeadDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadDto | null>(null);
  const [qInput, setQInput] = useState(searchParams.get('q') ?? '');
  const restoredFiltersRef = useRef(false);

  useEffect(() => {
    setQInput(searchParams.get('q') ?? '');
  }, [searchParams]);

  const debouncedQ = useDebouncedValue(qInput, 300).trim();
  const viewParam = searchParams.get('view');
  const view: LeadView = viewParam === 'kanban' ? 'kanban' : 'list';
  const statusParam = searchParams.get('status');
  const status: LeadStatusFilter =
    statusParam === 'open' || statusParam === 'won' || statusParam === 'lost' ? statusParam : '';
  const ownerId = searchParams.get('owner_id') ?? '';
  const pipelineIdParam = searchParams.get('pipeline_id') ?? '';
  const priorityMinInput = searchParams.get('priority_min') ?? '';
  const page = Math.max(Number(searchParams.get('page') ?? '1') || 1, 1);
  const pageSize = Math.max(Number(searchParams.get('pageSize') ?? '20') || 20, 1);

  const pipelinesQuery = useQuery({
    queryKey: ['pipelines'],
    queryFn: listPipelines,
  });

  const pipelines = pipelinesQuery.data ?? [];
  const defaultPipeline = useMemo(() => resolveDefaultPipeline(pipelines), [pipelines]);

  useEffect(() => {
    if (restoredFiltersRef.current) return;
    restoredFiltersRef.current = true;
    if (searchParams.toString() !== '') return;

    const saved = loadFilters();
    if (!saved) return;

    router.replace(`${pathname}?${saved}`);
  }, [loadFilters, pathname, router, searchParams]);

  useEffect(() => {
    if (pipelines.length === 0) return;
    if (pipelineIdParam && pipelines.some((pipeline) => pipeline.id === pipelineIdParam)) return;

    const fallbackPipeline = resolveDefaultPipeline(pipelines);
    if (!fallbackPipeline) return;

    const next = new URLSearchParams(searchParams.toString());
    next.set('pipeline_id', fallbackPipeline.id);
    const serialized = next.toString();
    router.replace(serialized ? `${pathname}?${serialized}` : pathname);
  }, [defaultPipeline, pathname, pipelineIdParam, pipelines, router, searchParams]);

  const selectedPipelineId = pipelineIdParam || defaultPipeline?.id || '';
  const selectedPipeline =
    pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? defaultPipeline ?? null;

  const query = useMemo<LeadListQuery>(
    () => ({
      q: debouncedQ || undefined,
      ownerId: ownerId || undefined,
      status: status || undefined,
      priorityMin: priorityMinInput ? Number(priorityMinInput) : undefined,
      pipelineId: view === 'kanban' ? selectedPipelineId || undefined : undefined,
      page: view === 'kanban' ? 1 : page,
      pageSize: view === 'kanban' ? 200 : pageSize,
    }),
    [debouncedQ, ownerId, page, pageSize, priorityMinInput, selectedPipelineId, status, view],
  );

  useEffect(() => {
    const next = buildSearchParams({
      q: debouncedQ || null,
      owner_id: ownerId || null,
      status: status || null,
      priority_min: priorityMinInput || null,
      view,
      pipeline_id: selectedPipelineId || null,
      page,
      pageSize,
    });
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [
    debouncedQ,
    ownerId,
    page,
    pageSize,
    pathname,
    priorityMinInput,
    router,
    searchParams,
    selectedPipelineId,
    status,
    view,
  ]);

  useEffect(() => {
    saveFilters(new URLSearchParams(searchParams.toString()));
  }, [searchParams, saveFilters]);

  const leadsQuery = useQuery({
    queryKey: ['leads', query],
    queryFn: () => listLeads(query),
    enabled: view === 'list' || Boolean(selectedPipelineId),
  });

  function replaceSearch(next: Record<string, string | null>): void {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(next)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const serialized = params.toString();
    startTransition(() => {
      router.replace(serialized ? `${pathname}?${serialized}` : pathname);
    });
  }

  async function invalidateLeads(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['leads'] });
  }

  async function handleLeadMutation(): Promise<void> {
    await invalidateLeads();
    setEditLead(null);
    setMoveLead(null);
    setWonLead(null);
    setLostLead(null);
    setDeleteTarget(null);
  }

  async function handleKanbanMove(
    leadId: string,
    nextStageId: string,
    nextStageKind: 'open' | 'won' | 'lost',
    lead: LeadDto,
  ): Promise<void> {
    if (nextStageKind === 'won') {
      setWonLead(lead);
      return;
    }
    if (nextStageKind === 'lost') {
      setLostLead(lead);
      return;
    }

    try {
      await updateLead(leadId, { stageId: nextStageId });
      await invalidateLeads();
      toast.success('Stage actualizado.');
    } catch {
      toast.error('No se pudo mover el lead de stage.');
    }
  }

  const data = leadsQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasActiveFilters = Boolean(
    query.q ||
      query.ownerId ||
      query.status ||
      query.priorityMin !== undefined ||
      (view === 'kanban' &&
        pipelineIdParam &&
        pipelineIdParam !== (defaultPipeline?.id ?? pipelineIdParam)),
  );

  const ownerOptions = useMemo(() => {
    const base = new Map<string, string>();
    if (currentUser) base.set(currentUser.id, currentUser.name);
    for (const lead of data?.items ?? []) {
      base.set(lead.ownerId, ownerLabel(lead));
    }
    return [...base.entries()].map(([id, label]) => ({ id, label }));
  }, [currentUser, data?.items]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
            <span className="border-border bg-surface-muted rounded-full border px-2.5 py-1 text-xs font-medium">
              {data?.total ?? 0}
            </span>
          </div>
          <p className="text-text-muted mt-1 text-sm">
            Gestiona oportunidades, stages y transiciones del pipeline comercial.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="border-border bg-surface flex h-10 rounded-md border p-1">
            <button
              type="button"
              onClick={() => replaceSearch({ view: 'list', page: null })}
              className={`rounded-sm px-3 text-sm font-medium transition ${
                view === 'list' ? 'bg-accent text-white' : 'text-text-muted'
              }`}
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => replaceSearch({ view: 'kanban', page: null })}
              className={`rounded-sm px-3 text-sm font-medium transition ${
                view === 'kanban' ? 'bg-accent text-white' : 'text-text-muted'
              }`}
            >
              Kanban
            </button>
          </div>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Nuevo lead
          </button>
        </div>
      </div>

      <div className="border-border bg-surface rounded-lg border p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                clearFilters();
                router.replace(pathname);
              }}
              className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
            >
              Restablecer
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1.5 xl:col-span-2">
            <label htmlFor="leads-q" className="block text-sm font-medium">
              Buscar
            </label>
            <input
              id="leads-q"
              value={qInput}
              onChange={(event) => {
                setQInput(event.target.value);
                replaceSearch({ q: event.target.value || null, page: null });
              }}
              placeholder="Empresa, contacto o pipeline"
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="leads-owner" className="block text-sm font-medium">
              Owner
            </label>
            <select
              id="leads-owner"
              value={ownerId}
              onChange={(event) =>
                replaceSearch({ owner_id: event.target.value || null, page: null })
              }
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            >
              <option value="">Todos</option>
              {ownerOptions.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="leads-status" className="block text-sm font-medium">
              Status
            </label>
            <select
              id="leads-status"
              value={status}
              onChange={(event) =>
                replaceSearch({ status: event.target.value || null, page: null })
              }
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            >
              <option value="">Todos</option>
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="leads-priority-min" className="block text-sm font-medium">
              Prioridad mínima
            </label>
            <input
              id="leads-priority-min"
              type="number"
              min={0}
              max={100}
              value={priorityMinInput}
              onChange={(event) =>
                replaceSearch({ priority_min: event.target.value || null, page: null })
              }
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
            />
          </div>
        </div>

        {view === 'kanban' && pipelines.length > 1 ? (
          <div className="mt-4 space-y-1.5">
            <label htmlFor="leads-pipeline" className="block text-sm font-medium">
              Pipeline
            </label>
            <select
              id="leads-pipeline"
              value={selectedPipelineId}
              onChange={(event) => replaceSearch({ pipeline_id: event.target.value, page: null })}
              className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition md:max-w-sm"
            >
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="border-border bg-surface rounded-lg border shadow-sm">
        {leadsQuery.isLoading || pipelinesQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: view === 'kanban' ? 4 : 5 }).map((_, index) => (
              <div key={index} className="bg-surface-muted h-16 animate-pulse rounded-md" />
            ))}
          </div>
        ) : leadsQuery.isError || pipelinesQuery.isError ? (
          <div className="p-8 text-center">
            <p className="text-sm">No se pudieron cargar los leads.</p>
          </div>
        ) : data && data.total === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
            <div>
              <h2 className="text-lg font-semibold">
                {hasActiveFilters ? 'No hay resultados para tus filtros.' : 'Aún no hay leads'}
              </h2>
              <p className="text-text-muted mt-1 text-sm">
                {hasActiveFilters
                  ? 'Prueba otra combinación de pipeline, owner o estado.'
                  : 'Empieza creando el primer lead del CRM.'}
              </p>
            </div>
            {!hasActiveFilters ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
              >
                Crear tu primer lead
              </button>
            ) : null}
          </div>
        ) : view === 'kanban' && selectedPipeline ? (
          <div className="p-5">
            <KanbanBoard
              pipeline={selectedPipeline}
              leads={data?.items ?? []}
              onEditLead={setEditLead}
              onRequestMoveStage={setMoveLead}
              onLeadMoved={(...args) => {
                void handleKanbanMove(...args);
              }}
            />
          </div>
        ) : (
          <>
            <LeadList
              items={data?.items ?? []}
              onEdit={setEditLead}
              onMoveStage={setMoveLead}
              onMarkWon={setWonLead}
              onMarkLost={setLostLead}
              onDelete={setDeleteTarget}
            />

            <div className="border-border flex items-center justify-between border-t px-5 py-4">
              <button
                type="button"
                onClick={() => replaceSearch({ page: String(page - 1) })}
                disabled={page <= 1}
                className="border-border bg-surface-muted h-10 rounded-md border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <p className="text-text-muted text-sm">
                Página {data?.page ?? 1} de {totalPages}
              </p>
              <button
                type="button"
                onClick={() => replaceSearch({ page: String(page + 1) })}
                disabled={page >= totalPages}
                className="border-border bg-surface-muted h-10 rounded-md border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>

      <LeadFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        onSuccess={(_lead) => {
          void handleLeadMutation();
          setCreateOpen(false);
        }}
      />

      <LeadFormDialog
        open={Boolean(editLead)}
        onClose={() => setEditLead(null)}
        mode="edit"
        lead={editLead ?? undefined}
        onSuccess={(_lead) => {
          void handleLeadMutation();
        }}
      />

      <MoveStageDialog
        open={Boolean(moveLead)}
        onClose={() => setMoveLead(null)}
        lead={moveLead}
        pipeline={
          pipelines.find((pipeline) => pipeline.id === moveLead?.pipelineId) ??
          selectedPipeline ??
          null
        }
        onSuccess={(_lead) => {
          void handleLeadMutation();
        }}
        onRequestWon={(lead) => setWonLead(lead)}
        onRequestLost={(lead) => setLostLead(lead)}
      />

      <WonLeadDialog
        open={Boolean(wonLead)}
        onClose={() => setWonLead(null)}
        leadId={wonLead?.id ?? ''}
        onSuccess={() => {
          void handleLeadMutation();
        }}
      />

      <LostLeadDialog
        open={Boolean(lostLead)}
        onClose={() => setLostLead(null)}
        leadId={lostLead?.id ?? ''}
        onSuccess={() => {
          void handleLeadMutation();
        }}
      />

      <DeleteLeadDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        lead={deleteTarget}
        onSuccess={() => {
          void handleLeadMutation();
        }}
      />
    </div>
  );
}

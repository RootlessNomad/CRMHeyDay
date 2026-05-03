'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { CreateIdeaManualDialog } from '@/components/content/CreateIdeaManualDialog';
import { DeleteIdeaDialog } from '@/components/content/DeleteIdeaDialog';
import { DraftJobsTracker } from '@/components/content/DraftJobsTracker';
import { DraftRequestDialog } from '@/components/content/DraftRequestDialog';
import { EditIdeaDialog } from '@/components/content/EditIdeaDialog';
import { GenerateIdeasDialog } from '@/components/content/GenerateIdeasDialog';
import { IdeaCard } from '@/components/content/IdeaCard';
import { IdeaFiltersBar, type IdeaFiltersValue } from '@/components/content/IdeaFiltersBar';
import { IdeaJobTracker } from '@/components/content/IdeaJobTracker';
import { listIdeas, type IdeaDto } from '@/lib/api/content';

const PAGE_SIZE = 10;

export default function ContentIdeasPage(): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<IdeaFiltersValue>({});
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<IdeaDto | null>(null);
  const [deleteIdeaTarget, setDeleteIdeaTarget] = useState<IdeaDto | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeDraftState, setActiveDraftState] = useState<{
    jobIds: string[];
    itemIds: string[];
  } | null>(null);

  const ideasQuery = useQuery({
    queryKey: ['content', 'ideas', filters, PAGE_SIZE, offset],
    queryFn: () => listIdeas({ ...filters, limit: PAGE_SIZE, offset }),
  });

  const ideas = ideasQuery.data?.items ?? [];
  const total = ideasQuery.data?.total ?? 0;
  const hasPreviousPage = offset > 0;
  const hasNextPage = offset + PAGE_SIZE < total;

  function handleFilterChange(nextFilters: IdeaFiltersValue): void {
    setOffset(0);
    setFilters(nextFilters);
  }

  async function handleIdeasJobComplete(): Promise<void> {
    setActiveJobId(null);
    await queryClient.invalidateQueries({ queryKey: ['content', 'ideas'] });
  }

  function handleAllJobsComplete(firstItemId: string): void {
    router.push(`/content/items/${firstItemId}`);
    toast.success('Borrador listo');
    setActiveDraftState(null);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Ideas de contenido</h1>
            <span className="border-border bg-surface-muted rounded-full border px-2.5 py-1 text-xs font-medium">
              {total}
            </span>
          </div>
          <p className="text-text-muted mt-1 text-sm">
            Genera ideas y dispara borradores multi-canal desde la misma vista.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
          >
            Crear idea manual
          </button>
          <button
            type="button"
            onClick={() => setGenerateOpen(true)}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Generar con IA
          </button>
        </div>
      </div>

      {activeJobId ? (
        <IdeaJobTracker jobId={activeJobId} onComplete={handleIdeasJobComplete} />
      ) : null}

      {activeDraftState ? (
        <DraftJobsTracker
          jobIds={activeDraftState.jobIds}
          itemIds={activeDraftState.itemIds}
          onAllComplete={handleAllJobsComplete}
        />
      ) : null}

      <IdeaFiltersBar value={filters} onChange={handleFilterChange} />

      {ideasQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="bg-surface-muted h-40 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : ideasQuery.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm text-red-700">
            {ideasQuery.error instanceof Error
              ? ideasQuery.error.message
              : 'No se pudieron cargar las ideas.'}
          </p>
        </div>
      ) : total === 0 ? (
        <div className="border-border bg-surface rounded-2xl border p-10 text-center shadow-sm">
          <p className="text-sm font-medium">No hay ideas con los filtros actuales.</p>
          <p className="text-text-muted mt-2 text-sm">
            Crea una manualmente o lanza una generación con IA para empezar.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onEdit={() => setSelectedIdea(idea)}
              onDelete={() => setDeleteIdeaTarget(idea)}
              onGenerateDrafts={() => setSelectedIdeaId(idea.id)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
          disabled={!hasPreviousPage}
          className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          Anterior
        </button>
        <p className="text-text-muted text-sm">
          Página {Math.floor(offset / PAGE_SIZE) + 1} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}
        </p>
        <button
          type="button"
          onClick={() => setOffset((current) => current + PAGE_SIZE)}
          disabled={!hasNextPage}
          className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          Siguiente
        </button>
      </div>

      <CreateIdeaManualDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <GenerateIdeasDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onJobCreated={(jobId) => setActiveJobId(jobId)}
      />

      {selectedIdea ? (
        <EditIdeaDialog
          idea={selectedIdea}
          open={Boolean(selectedIdea)}
          onClose={() => setSelectedIdea(null)}
        />
      ) : null}

      {deleteIdeaTarget ? (
        <DeleteIdeaDialog
          idea={deleteIdeaTarget}
          open={Boolean(deleteIdeaTarget)}
          onClose={() => setDeleteIdeaTarget(null)}
        />
      ) : null}

      {selectedIdeaId ? (
        <DraftRequestDialog
          ideaId={selectedIdeaId}
          open={Boolean(selectedIdeaId)}
          onClose={() => setSelectedIdeaId(null)}
          onJobsCreated={(itemIds, jobIds) => {
            setActiveDraftState({ jobIds, itemIds });
            setSelectedIdeaId(null);
          }}
        />
      ) : null}
    </div>
  );
}

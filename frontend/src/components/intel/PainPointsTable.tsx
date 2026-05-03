'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  deletePainPoint,
  listPainPoints,
  updatePainPoint,
  type ListPainPointsQuery,
  type PainPointConfidence,
} from '@/lib/api/intel';

const CONFIDENCE_LABELS: Record<PainPointConfidence, string> = {
  observed: 'Observado',
  inferred: 'Inferido',
  speculative: 'Especulativo',
};

const CONFIDENCE_STYLES: Record<PainPointConfidence, string> = {
  observed: 'bg-blue-50 text-blue-700',
  inferred: 'bg-yellow-50 text-yellow-800',
  speculative: 'bg-surface-muted text-text-muted',
};

function truncateEvidence(text: string): string {
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function buildFilters(
  confidence: PainPointConfidence | 'all',
  onlyUnverified: boolean,
): ListPainPointsQuery {
  return {
    confidence: confidence === 'all' ? undefined : confidence,
    human_verified: onlyUnverified ? false : undefined,
  };
}

function PainPointsSkeleton(): JSX.Element {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="bg-surface-muted h-12 animate-pulse rounded-md" />
      ))}
    </div>
  );
}

function VerifiedBadge({ checked }: { checked: boolean }): JSX.Element {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        checked ? 'bg-green-50 text-green-700' : 'bg-surface-muted text-text-muted'
      }`}
    >
      {checked ? 'Sí' : 'No'}
    </span>
  );
}

export function PainPointsTable(): JSX.Element {
  const queryClient = useQueryClient();
  const [confidence, setConfidence] = useState<PainPointConfidence | 'all'>('all');
  const [onlyUnverified, setOnlyUnverified] = useState(false);

  const filters = useMemo(
    () => buildFilters(confidence, onlyUnverified),
    [confidence, onlyUnverified],
  );

  const painPointsQuery = useQuery({
    queryKey: ['intel', 'pain-points', filters],
    queryFn: () => listPainPoints(filters),
  });

  const verifyMutation = useMutation({
    mutationFn: (painPointId: string) => updatePainPoint(painPointId, { human_verified: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['intel', 'pain-points'] });
      toast.success('Pain point verificado.');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo verificar el pain point.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (painPointId: string) => deletePainPoint(painPointId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['intel', 'pain-points'] });
      toast.success('Pain point eliminado.');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo eliminar el pain point.'));
    },
  });

  const painPoints = painPointsQuery.data?.data ?? [];

  return (
    <section className="border-border bg-surface rounded-lg border shadow-sm">
      <div className="border-border flex flex-col gap-3 border-b p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="space-y-1">
            <span className="text-text-muted block text-xs font-medium uppercase tracking-[0.14em]">
              Confianza
            </span>
            <select
              value={confidence}
              onChange={(event) => setConfidence(event.target.value as PainPointConfidence | 'all')}
              className="border-border bg-bg focus:border-accent h-10 rounded-md border px-3 text-sm outline-none transition"
              aria-label="Filtrar por confianza"
            >
              <option value="all">Todos</option>
              <option value="observed">Observado</option>
              <option value="inferred">Inferido</option>
              <option value="speculative">Especulativo</option>
            </select>
          </label>

          <label className="flex items-center gap-3 pt-5 sm:pt-6">
            <input
              type="checkbox"
              checked={onlyUnverified}
              onChange={(event) => setOnlyUnverified(event.target.checked)}
              className="accent-accent h-4 w-4"
            />
            <span className="text-sm">Solo no verificados</span>
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            setConfidence('all');
            setOnlyUnverified(false);
          }}
          className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
        >
          Limpiar
        </button>
      </div>

      {painPointsQuery.isLoading ? (
        <PainPointsSkeleton />
      ) : painPointsQuery.isError ? (
        <div className="p-8 text-center">
          <p className="text-sm text-red-600">
            {getErrorMessage(painPointsQuery.error, 'No se pudieron cargar los pain points.')}
          </p>
        </div>
      ) : painPoints.length === 0 ? (
        <div className="flex min-h-72 items-center justify-center p-8 text-center">
          <p className="text-text-muted max-w-lg text-sm">
            No hay pain points. Lanza una investigación para detectarlos automáticamente.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-border text-text-muted border-b text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Empresa</th>
                <th className="px-5 py-3 font-medium">Categoría</th>
                <th className="px-5 py-3 font-medium">Confianza</th>
                <th className="px-5 py-3 font-medium">Evidencia</th>
                <th className="px-5 py-3 font-medium">Verificado</th>
                <th className="px-5 py-3 font-medium">Fuente</th>
                <th className="px-5 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {painPoints.map((painPoint) => {
                const deleting =
                  deleteMutation.isPending && deleteMutation.variables === painPoint.id;
                const verifying =
                  verifyMutation.isPending && verifyMutation.variables === painPoint.id;

                return (
                  <tr key={painPoint.id} className="border-border border-b last:border-b-0">
                    <td className="px-5 py-4 font-medium">{painPoint.company_name}</td>
                    <td className="px-5 py-4">{painPoint.category_label_es}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${CONFIDENCE_STYLES[painPoint.confidence]}`}
                      >
                        {CONFIDENCE_LABELS[painPoint.confidence]}
                      </span>
                    </td>
                    <td className="px-5 py-4" title={painPoint.evidence_text}>
                      {truncateEvidence(painPoint.evidence_text)}
                    </td>
                    <td className="px-5 py-4">
                      <VerifiedBadge checked={painPoint.human_verified} />
                    </td>
                    <td className="px-5 py-4">
                      {painPoint.evidence_source_url ? (
                        <a
                          href={painPoint.evidence_source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:underline"
                        >
                          Abrir fuente
                        </a>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => verifyMutation.mutate(painPoint.id)}
                          disabled={painPoint.human_verified || verifying || deleting}
                          className="border-border bg-surface-muted hover:bg-bg h-9 rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {verifying ? 'Verificando…' : 'Verificar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm('¿Eliminar este pain point?')) return;
                            deleteMutation.mutate(painPoint.id);
                          }}
                          disabled={verifying || deleting}
                          className="border-border bg-surface-muted hover:bg-bg h-9 rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deleting ? 'Eliminando…' : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

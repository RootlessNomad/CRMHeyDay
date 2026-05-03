'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { listServiceFit, regenerateServiceFit, type ServiceFitDto } from '@/lib/api/intel';

const GENERATED_BY_STYLES: Record<ServiceFitDto['generated_by'], string> = {
  claude: 'bg-emerald-50 text-emerald-700',
  rule: 'bg-surface-muted text-text-muted',
  human: 'bg-blue-50 text-blue-700',
};

const GENERATED_BY_LABELS: Record<ServiceFitDto['generated_by'], string> = {
  claude: 'Claude',
  rule: 'Regla',
  human: 'Humano',
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function FitScoreBar({ value }: { value: number }): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-text-muted text-xs uppercase tracking-[0.14em]">Fit score</span>
        <span className="text-sm font-semibold">{value}/100</span>
      </div>
      <div className="bg-surface-muted h-2.5 rounded-full">
        <div
          className="bg-accent h-2.5 rounded-full transition-all"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function ServiceFitSkeleton(): JSX.Element {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="border-border bg-surface rounded-2xl border p-5 shadow-sm">
          <div className="bg-surface-muted h-6 w-40 animate-pulse rounded-md" />
          <div className="bg-surface-muted mt-4 h-20 animate-pulse rounded-xl" />
          <div className="bg-surface-muted mt-4 h-14 animate-pulse rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function ServiceFitCard({ item }: { item: ServiceFitDto }): JSX.Element {
  return (
    <article className="border-border bg-surface space-y-4 rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">{item.service_line_label_es}</h3>
          <p className="text-text-muted mt-1 text-xs uppercase tracking-[0.14em]">
            {item.service_line_key}
          </p>
        </div>

        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${GENERATED_BY_STYLES[item.generated_by]}`}
        >
          {GENERATED_BY_LABELS[item.generated_by]}
        </span>
      </div>

      <FitScoreBar value={item.fit_score} />

      <div className="space-y-3">
        <div>
          <p className="text-text-muted text-xs uppercase tracking-[0.14em]">Rationale</p>
          <p className="mt-1 text-sm leading-6">{item.rationale_es}</p>
        </div>
        <div>
          <p className="text-text-muted text-xs uppercase tracking-[0.14em]">Expected outcome</p>
          <p className="mt-1 text-sm leading-6">{item.expected_outcome_es}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {item.triggering_signals.map((signal) => (
          <span
            key={signal}
            className="border-border bg-surface-muted rounded-full border px-3 py-1 text-xs font-medium"
          >
            {signal}
          </span>
        ))}
      </div>
    </article>
  );
}

export function ServiceFitList({ companyId }: { companyId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const normalizedCompanyId = companyId.trim();

  const serviceFitQuery = useQuery({
    queryKey: ['intel', 'service-fit', normalizedCompanyId],
    queryFn: () => listServiceFit(normalizedCompanyId),
    enabled: normalizedCompanyId.length > 0,
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateServiceFit(normalizedCompanyId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ['intel', 'service-fit', normalizedCompanyId],
      });
      toast.success(
        result.models_used.length > 0
          ? `Recomendaciones regeneradas con IA (${result.models_used.join(', ')}).`
          : 'Recomendaciones regeneradas.',
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'No se pudo regenerar el service fit.'));
    },
  });

  const recommendations = serviceFitQuery.data?.data ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Service Fit</h2>
          <p className="text-text-muted mt-1 text-sm">
            Recomendaciones de líneas de servicio basadas en los pain points activos de la empresa.
          </p>
        </div>

        <button
          type="button"
          onClick={() => regenerateMutation.mutate()}
          disabled={normalizedCompanyId.length === 0 || regenerateMutation.isPending}
          className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {regenerateMutation.isPending ? 'Regenerando…' : 'Regenerar con IA'}
        </button>
      </div>

      {serviceFitQuery.isLoading ? (
        <ServiceFitSkeleton />
      ) : serviceFitQuery.isError ? (
        <div className="border-border bg-surface rounded-2xl border p-8 text-center shadow-sm">
          <p className="text-sm text-red-600">
            {getErrorMessage(serviceFitQuery.error, 'No se pudieron cargar las recomendaciones.')}
          </p>
        </div>
      ) : recommendations.length === 0 ? (
        <div className="border-border bg-surface rounded-2xl border p-8 text-center shadow-sm">
          <p className="text-text-muted text-sm">
            Aún sin recomendaciones. Lanza o regenera el análisis.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {recommendations.map((item) => (
            <ServiceFitCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

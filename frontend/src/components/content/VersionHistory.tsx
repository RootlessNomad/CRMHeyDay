'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { GENERATED_BY_LABELS, createVersion, type ContentVersionDto } from '@/lib/api/content';

interface VersionHistoryProps {
  itemId: string;
  versions: ContentVersionDto[];
  currentVersionId: string | null;
  onRevert: () => void;
}

const GENERATED_BY_STYLES: Record<string, string> = {
  claude: 'border-sky-200 bg-sky-50 text-sky-700',
  human: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  claude_edited_by_human: 'border-amber-200 bg-amber-50 text-amber-700',
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

export function VersionHistory({
  itemId,
  versions,
  currentVersionId,
  onRevert,
}: VersionHistoryProps): JSX.Element {
  const revertMutation = useMutation({
    mutationFn: async (version: ContentVersionDto) =>
      createVersion(itemId, {
        body: version.body,
        title: version.title ?? undefined,
        hooks: version.hooks,
        ctas: version.ctas,
        hashtags: version.hashtags,
      }),
    onSuccess: (_nextVersion, version) => {
      toast.success(`Revertido a v${version.version_number}`);
      onRevert();
    },
    onError: () => {
      toast.error('No se pudo guardar');
    },
  });

  return (
    <section className="border-border bg-surface rounded-2xl border shadow-sm">
      <div className="border-border border-b px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Historial de versiones</h2>
      </div>

      {versions.length === 0 ? (
        <div className="text-text-muted px-5 py-6 text-sm">No hay versiones disponibles.</div>
      ) : (
        <div className="divide-border divide-y">
          {versions.map((version) => {
            const isCurrent = version.id === currentVersionId;
            const isReverting =
              revertMutation.isPending && revertMutation.variables?.id === version.id;

            return (
              <div
                key={version.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">v{version.version_number}</span>
                    <span className="text-text-muted text-xs">
                      {formatRelativeDate(version.created_at)}
                    </span>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                        GENERATED_BY_STYLES[version.generated_by] ?? GENERATED_BY_STYLES['human']
                      }`}
                    >
                      {GENERATED_BY_LABELS[version.generated_by] ?? version.generated_by}
                    </span>
                    {isCurrent ? (
                      <span className="border-border bg-surface-muted text-text-muted inline-flex rounded-full border px-2.5 py-1 text-xs font-medium">
                        Actual
                      </span>
                    ) : null}
                  </div>
                  <p className="text-text-muted line-clamp-2 whitespace-pre-wrap text-sm">
                    {version.body}
                  </p>
                </div>

                {!isCurrent ? (
                  <button
                    type="button"
                    onClick={() => revertMutation.mutate(version)}
                    disabled={isReverting}
                    className="border-border bg-surface-muted hover:bg-bg rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isReverting ? 'Revirtiendo…' : 'Revertir'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

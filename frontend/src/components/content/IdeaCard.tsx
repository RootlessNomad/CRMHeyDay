'use client';

import { IDEA_STATUS_LABELS, VERTICAL_LABELS, type IdeaDto } from '@/lib/api/content';

interface IdeaCardProps {
  idea: IdeaDto;
  onEdit: () => void;
  onDelete: () => void;
  onGenerateDrafts: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  idea: 'border-sky-200 bg-sky-50 text-sky-700',
  in_production: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  shipped: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  archived: 'border-border bg-surface-muted text-text-muted',
};

export function IdeaCard({ idea, onEdit, onDelete, onGenerateDrafts }: IdeaCardProps): JSX.Element {
  const canGenerateDrafts = idea.items_count === 0 || idea.status === 'idea';

  return (
    <article className="border-border bg-surface space-y-4 rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{idea.title}</h2>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[idea.status] ?? STATUS_STYLES['archived']}`}
            >
              {IDEA_STATUS_LABELS[idea.status] ?? idea.status}
            </span>
          </div>
          <p className="text-text-muted text-sm">{idea.angle}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canGenerateDrafts ? (
            <button
              type="button"
              onClick={onGenerateDrafts}
              className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
            >
              Generar borradores
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEdit}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="border-border bg-surface-muted rounded-full border px-3 py-1">
          {idea.pillar_label}
        </span>
        {idea.icp_vertical ? (
          <span className="border-border bg-surface-muted rounded-full border px-3 py-1">
            {VERTICAL_LABELS[idea.icp_vertical] ?? idea.icp_vertical}
          </span>
        ) : null}
        <span className="border-border bg-surface-muted rounded-full border px-3 py-1">
          {idea.items_count} borradores
        </span>
      </div>
    </article>
  );
}

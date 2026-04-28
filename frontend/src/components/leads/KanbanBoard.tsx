'use client';

import {
  DndContext,
  closestCorners,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties, ReactNode } from 'react';

import type { LeadDto } from '@/types/lead';
import type { PipelineDto } from '@/types/pipeline';

interface KanbanBoardProps {
  pipeline: PipelineDto;
  leads: LeadDto[];
  onLeadMoved: (
    leadId: string,
    nextStageId: string,
    nextStageKind: 'open' | 'won' | 'lost',
    lead: LeadDto,
  ) => void;
  onEditLead: (lead: LeadDto) => void;
  onRequestMoveStage?: (lead: LeadDto) => void;
}

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

function contactName(lead: LeadDto): string {
  const firstName = lead.primaryContact?.firstName ?? '';
  const lastName = lead.primaryContact?.lastName ?? '';
  return [firstName, lastName].filter(Boolean).join(' ') || 'Sin contacto';
}

function stageBorder(color: string | null): CSSProperties | undefined {
  return color ? { borderTopColor: color } : undefined;
}

function LeadCard({
  lead,
  onEditLead,
  onRequestMoveStage,
}: {
  lead: LeadDto;
  onEditLead: (lead: LeadDto) => void;
  onRequestMoveStage?: (lead: LeadDto) => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  });

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.55 : 1,
      }}
      className="border-border bg-surface rounded-lg border p-4 shadow-sm"
    >
      <button
        type="button"
        onClick={() => onEditLead(lead)}
        className="block text-left text-sm font-semibold underline-offset-4 hover:underline"
      >
        {lead.company?.name ?? lead.companyId}
      </button>
      <p className="text-text-muted mt-1 text-xs">{contactName(lead)}</p>

      <div
        {...listeners}
        {...attributes}
        className="border-border bg-surface-muted mt-3 rounded-md border px-3 py-2 text-xs font-medium"
      >
        Arrastrar
      </div>

      <dl className="mt-3 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-text-muted">Prioridad</dt>
          <dd>{lead.priorityScore}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-text-muted">Owner</dt>
          <dd className="truncate text-right">{lead.owner?.name ?? lead.ownerId}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-text-muted">Próxima acción</dt>
          <dd>{lead.nextActionAt ? formatRelativeDate(lead.nextActionAt) : '—'}</dd>
        </div>
      </dl>

      {onRequestMoveStage ? (
        <button
          type="button"
          onClick={() => onRequestMoveStage(lead)}
          className="border-border bg-surface-muted mt-3 h-8 rounded-md border px-3 text-xs font-medium"
        >
          Mover a stage…
        </button>
      ) : null}
    </article>
  );
}

function KanbanColumn({
  stageId,
  title,
  color,
  count,
  children,
}: {
  stageId: string;
  title: string;
  color: string | null;
  count: number;
  children: ReactNode;
}): JSX.Element {
  const { isOver, setNodeRef } = useDroppable({ id: stageId });

  return (
    <section
      ref={setNodeRef}
      className={`border-border bg-surface-muted min-h-80 rounded-xl border border-t-4 p-4 transition ${
        isOver ? 'ring-accent ring-2 ring-offset-2' : ''
      }`}
      style={stageBorder(color)}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="border-border bg-surface rounded-full border px-2.5 py-1 text-xs font-medium">
          {count}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function KanbanBoard({
  pipeline,
  leads,
  onLeadMoved,
  onEditLead,
  onRequestMoveStage,
}: KanbanBoardProps): JSX.Element {
  const stages = [...pipeline.stages].sort((a, b) => a.orderIndex - b.orderIndex);

  function handleDragEnd(event: DragEndEvent): void {
    const lead = event.active.data.current?.['lead'] as LeadDto | undefined;
    const nextStageId = typeof event.over?.id === 'string' ? event.over.id : null;
    if (!lead || !nextStageId || nextStageId === lead.stageId) return;

    const nextStage = stages.find((stage) => stage.id === nextStageId);
    if (!nextStage) return;

    onLeadMoved(lead.id, nextStage.id, nextStage.kind, lead);
  }

  return (
    <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage) => {
          const stageLeads = leads.filter((lead) => lead.stageId === stage.id);

          return (
            <KanbanColumn
              key={stage.id}
              stageId={stage.id}
              title={stage.name}
              color={stage.color}
              count={stageLeads.length}
            >
              {stageLeads.length === 0 ? (
                <div className="text-text-muted rounded-lg border border-dashed p-4 text-xs">
                  Sin leads en este stage.
                </div>
              ) : (
                stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onEditLead={onEditLead}
                    onRequestMoveStage={onRequestMoveStage}
                  />
                ))
              )}
            </KanbanColumn>
          );
        })}
      </div>
    </DndContext>
  );
}

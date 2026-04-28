'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';

import type { LeadDto } from '@/types/lead';

interface LeadListProps {
  items: LeadDto[];
  onEdit: (lead: LeadDto) => void;
  onMoveStage: (lead: LeadDto) => void;
  onMarkWon: (lead: LeadDto) => void;
  onMarkLost: (lead: LeadDto) => void;
  onDelete: (lead: LeadDto) => void;
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

  const diffYears = Math.round(diffMonths / 12);
  return formatter.format(diffYears, 'year');
}

function contactName(lead: LeadDto): string {
  const firstName = lead.primaryContact?.firstName ?? '';
  const lastName = lead.primaryContact?.lastName ?? '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  return fullName || '—';
}

function stageBadgeStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  return {
    borderColor: color,
    backgroundColor: `${color}22`,
    color,
  };
}

export function LeadList({
  items,
  onEdit,
  onMoveStage,
  onMarkWon,
  onMarkLost,
  onDelete,
}: LeadListProps): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-border text-text-muted border-b text-left">
          <tr>
            <th className="px-5 py-3 font-medium">Empresa</th>
            <th className="px-5 py-3 font-medium">Contacto</th>
            <th className="px-5 py-3 font-medium">Stage</th>
            <th className="px-5 py-3 font-medium">Owner</th>
            <th className="px-5 py-3 font-medium">Prioridad</th>
            <th className="px-5 py-3 font-medium">Próxima acción</th>
            <th className="px-5 py-3 font-medium">Actualizado</th>
            <th className="px-5 py-3 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((lead) => (
            <tr key={lead.id} className="border-border border-b align-top last:border-b-0">
              <td className="px-5 py-4">
                <div className="space-y-1">
                  <Link
                    href={`/companies/${lead.companyId}`}
                    className="block font-medium underline-offset-4 hover:underline"
                  >
                    {lead.company?.name ?? lead.companyId}
                  </Link>
                  <Link
                    href={`/leads/${lead.id}`}
                    className="text-text-muted inline-flex text-xs underline underline-offset-4"
                  >
                    Abrir lead
                  </Link>
                </div>
              </td>
              <td className="px-5 py-4">{contactName(lead)}</td>
              <td className="px-5 py-4">
                {lead.stage ? (
                  <span
                    className="border-border inline-flex rounded-full border px-2.5 py-1 text-xs font-medium"
                    style={stageBadgeStyle(lead.stage.color)}
                  >
                    {lead.stage.name}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-5 py-4">{lead.owner?.name ?? lead.ownerId}</td>
              <td className="px-5 py-4">{lead.priorityScore}</td>
              <td className="px-5 py-4">
                {lead.nextActionAt ? formatRelativeDate(lead.nextActionAt) : '—'}
              </td>
              <td className="text-text-muted px-5 py-4">{formatRelativeDate(lead.updatedAt)}</td>
              <td className="px-5 py-4">
                <div className="flex min-w-52 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onMoveStage(lead)}
                    className="border-border bg-surface-muted h-9 rounded-md border px-3 text-xs font-medium"
                  >
                    Mover a stage…
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(lead)}
                    className="border-border bg-surface-muted h-9 rounded-md border px-3 text-xs font-medium"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onMarkWon(lead)}
                    className="bg-accent h-9 rounded-md px-3 text-xs font-medium text-white"
                  >
                    Won
                  </button>
                  <button
                    type="button"
                    onClick={() => onMarkLost(lead)}
                    className="bg-danger h-9 rounded-md px-3 text-xs font-medium text-white"
                  >
                    Lost
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(lead)}
                    className="border-border h-9 rounded-md border px-3 text-xs font-medium"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

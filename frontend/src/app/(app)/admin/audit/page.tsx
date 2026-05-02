'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getAuditLog, type GetAuditLogParams } from '@/lib/api/admin';

const LIMIT = 50;

function formatDateTime(input: string): string {
  return new Date(input).toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getActorLabel(item: {
  actorName: string | null;
  actorEmail: string | null;
  actorUserId: string | null;
}): string {
  return item.actorName ?? item.actorEmail ?? item.actorUserId ?? 'Sistema';
}

function getEntityLabel(item: { entityType: string | null; entityId: string | null }): string {
  if (!item.entityType && !item.entityId) return '-';
  if (!item.entityType) return item.entityId ?? '-';
  if (!item.entityId) return item.entityType;
  return `${item.entityType} ${item.entityId}`;
}

export default function AdminAuditPage(): JSX.Element {
  const [action, setAction] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activeFilters, setActiveFilters] = useState<GetAuditLogParams>({});
  const [page, setPage] = useState(1);

  const auditQuery = useQuery({
    queryKey: ['admin-audit-log', activeFilters, page],
    queryFn: () =>
      getAuditLog({
        ...activeFilters,
        page,
        limit: LIMIT,
      }),
  });

  const result = auditQuery.data;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

  function applyFilters(): void {
    setActiveFilters({
      action: action.trim() || undefined,
      actorUserId: actorUserId.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
    });
    setPage(1);
  }

  function resetFilters(): void {
    setAction('');
    setActorUserId('');
    setFrom('');
    setTo('');
    setActiveFilters({});
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-text-muted mt-1 text-sm">Registro de acciones administrativas.</p>
      </div>

      <div className="border-border bg-surface rounded-lg border p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            type="text"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="Acción"
            className="border-border bg-bg h-10 rounded-md border px-3 text-sm outline-none"
          />
          <input
            type="text"
            value={actorUserId}
            onChange={(event) => setActorUserId(event.target.value)}
            placeholder="Usuario ID"
            className="border-border bg-bg h-10 rounded-md border px-3 text-sm outline-none"
          />
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="border-border bg-bg h-10 rounded-md border px-3 text-sm outline-none"
          />
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="border-border bg-bg h-10 rounded-md border px-3 text-sm outline-none"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Filtrar
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="border-border bg-surface rounded-lg border shadow-sm">
        {auditQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="bg-surface-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : auditQuery.isError ? (
          <div className="p-8 text-center">
            <p className="text-sm">No se pudo cargar el audit log.</p>
          </div>
        ) : !result || result.items.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
            <div>
              <h2 className="text-lg font-semibold">Sin registros</h2>
              <p className="text-text-muted mt-1 text-sm">
                No hay acciones administrativas para los filtros actuales.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-border text-text-muted border-b text-left">
                  <tr>
                    <th className="px-5 py-3 font-medium">Fecha</th>
                    <th className="px-5 py-3 font-medium">Actor</th>
                    <th className="px-5 py-3 font-medium">Acción</th>
                    <th className="px-5 py-3 font-medium">Entidad</th>
                    <th className="px-5 py-3 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={item.id} className="border-border border-b last:border-b-0">
                      <td className="px-5 py-4 font-medium">{formatDateTime(item.createdAt)}</td>
                      <td className="text-text-muted px-5 py-4">{getActorLabel(item)}</td>
                      <td className="px-5 py-4">{item.action}</td>
                      <td className="text-text-muted px-5 py-4">{getEntityLabel(item)}</td>
                      <td className="text-text-muted px-5 py-4">{item.ip ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-border flex items-center justify-between gap-3 border-t px-5 py-4">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <p className="text-text-muted text-sm">
                Página {page} de {totalPages}
              </p>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

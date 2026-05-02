'use client';

import { useQuery } from '@tanstack/react-query';

import { HealthChip } from '@/components/credentials/HealthChip';
import { getIntegrationHealth, type IntegrationHealthSnapshotDto } from '@/lib/api/admin';
import type { CredentialHealthDto } from '@/lib/api/credentials';

function formatDate(input: string | null): string {
  if (!input) return 'Nunca';
  return new Date(input).toLocaleDateString('es', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function toCredentialHealth(snapshot: IntegrationHealthSnapshotDto): CredentialHealthDto {
  return {
    lastStatus: snapshot.lastStatus,
    lastCheckedAt: snapshot.lastCheckedAt,
    lastError: snapshot.lastError,
    successCount24h: snapshot.successCount24h,
    errorCount24h: snapshot.errorCount24h,
  };
}

export default function AdminIntegrationsPage(): JSX.Element {
  const integrationsQuery = useQuery({
    queryKey: ['admin-integration-health'],
    queryFn: getIntegrationHealth,
  });

  const integrations = integrationsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estado de integraciones</h1>
        <p className="text-text-muted mt-1 text-sm">
          Snapshot del estado actual de cada credencial configurada.
        </p>
      </div>

      <div className="border-border bg-surface rounded-lg border shadow-sm">
        {integrationsQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="bg-surface-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : integrationsQuery.isError ? (
          <div className="p-8 text-center">
            <p className="text-sm">No se pudo cargar el estado de integraciones.</p>
          </div>
        ) : integrations.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
            <div>
              <h2 className="text-lg font-semibold">Sin integraciones</h2>
              <p className="text-text-muted mt-1 text-sm">
                No hay credenciales configuradas para mostrar estado.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-border text-text-muted border-b text-left">
                <tr>
                  <th className="px-5 py-3 font-medium">Key</th>
                  <th className="px-5 py-3 font-medium">Provider</th>
                  <th className="px-5 py-3 font-medium">Label</th>
                  <th className="px-5 py-3 font-medium">Estado activo</th>
                  <th className="px-5 py-3 font-medium">Salud</th>
                  <th className="px-5 py-3 font-medium">Errores 24h</th>
                  <th className="px-5 py-3 font-medium">Última comprobación</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((item) => (
                  <tr key={item.credentialId} className="border-border border-b last:border-b-0">
                    <td className="px-5 py-4">
                      <code className="bg-surface-muted rounded px-1.5 py-0.5 font-mono text-xs">
                        {item.key}
                      </code>
                    </td>
                    <td className="text-text-muted px-5 py-4">{item.provider}</td>
                    <td className="px-5 py-4 font-medium">{item.label}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          item.isActive
                            ? 'bg-green-50 text-green-600'
                            : 'bg-surface-muted text-text-muted'
                        }`}
                      >
                        {item.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <HealthChip health={toCredentialHealth(item)} />
                    </td>
                    <td className="text-text-muted px-5 py-4">{item.errorCount24h}</td>
                    <td className="text-text-muted px-5 py-4">{formatDate(item.lastCheckedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

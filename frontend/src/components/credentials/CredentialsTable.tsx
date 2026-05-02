'use client';

import type { CredentialDto } from '@/lib/api/credentials';

import { HealthChip } from './HealthChip';

interface CredentialsTableProps {
  credentials: CredentialDto[];
  onRotate: (cred: CredentialDto) => void;
  onToggleActive: (cred: CredentialDto) => void;
  onDelete: (cred: CredentialDto) => void;
  onTest: (cred: CredentialDto) => void;
}

function formatDate(input: string | null): string {
  if (!input) return 'Nunca';
  return new Date(input).toLocaleDateString('es', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function CredentialsTable({
  credentials,
  onRotate,
  onToggleActive,
  onDelete,
  onTest,
}: CredentialsTableProps): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-border text-text-muted border-b text-left">
          <tr>
            <th className="px-5 py-3 font-medium">Key</th>
            <th className="px-5 py-3 font-medium">Label</th>
            <th className="px-5 py-3 font-medium">Provider</th>
            <th className="px-5 py-3 font-medium">Salud</th>
            <th className="px-5 py-3 font-medium">Estado</th>
            <th className="px-5 py-3 font-medium">Última rotación</th>
            <th className="px-5 py-3 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {credentials.map((cred) => (
            <tr key={cred.id} className="border-border border-b last:border-b-0">
              <td className="px-5 py-4">
                <code className="bg-surface-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  {cred.key}
                </code>
              </td>
              <td className="px-5 py-4 font-medium">{cred.label}</td>
              <td className="text-text-muted px-5 py-4">{cred.provider}</td>
              <td className="px-5 py-4">
                <HealthChip health={cred.health} />
              </td>
              <td className="px-5 py-4">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    cred.isActive
                      ? 'bg-green-50 text-green-600'
                      : 'bg-surface-muted text-text-muted'
                  }`}
                >
                  {cred.isActive ? 'Activa' : 'Inactiva'}
                </span>
              </td>
              <td className="text-text-muted px-5 py-4">{formatDate(cred.lastRotatedAt)}</td>
              <td className="px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onRotate(cred)}
                    className="border-border bg-surface-muted hover:bg-bg h-9 rounded-md border px-3 text-sm font-medium transition"
                  >
                    Rotar
                  </button>
                  <button
                    type="button"
                    onClick={() => onTest(cred)}
                    disabled={!cred.isActive}
                    title={!cred.isActive ? 'Activa la credencial para probarla.' : undefined}
                    className="border-border bg-surface-muted hover:bg-bg h-9 rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Probar
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleActive(cred)}
                    className="border-border bg-surface-muted hover:bg-bg h-9 rounded-md border px-3 text-sm font-medium transition"
                  >
                    {cred.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(cred)}
                    className="border-border h-9 rounded-md border px-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
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

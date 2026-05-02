import type { CredentialHealthDto, CredentialHealthStatus } from '@/lib/api/credentials';

interface HealthChipProps {
  health: CredentialHealthDto | null;
}

const STATUS_STYLES: Record<CredentialHealthStatus, string> = {
  ok: 'bg-green-50 text-green-700',
  warn: 'bg-amber-50 text-amber-700',
  error: 'bg-red-50 text-red-700',
  unknown: 'bg-surface-muted text-text-muted',
};

const STATUS_LABELS: Record<CredentialHealthStatus, string> = {
  ok: 'OK',
  warn: 'Alerta',
  error: 'Error',
  unknown: 'Sin datos',
};

export function HealthChip({ health }: HealthChipProps): JSX.Element {
  const status: CredentialHealthStatus = health?.lastStatus ?? 'unknown';
  const tooltip = health?.lastError ? health.lastError.slice(0, 200) : undefined;

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
      title={tooltip}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { purgeOldLogs } from '@/lib/api/gdpr';

export default function AdminSettingsPage(): JSX.Element {
  const [retentionDays, setRetentionDays] = useState(90);
  const [purging, setPurging] = useState(false);
  const [lastResult, setLastResult] = useState<{
    aiLogsDeleted: number;
    externalLogsDeleted: number;
  } | null>(null);

  async function handlePurge(): Promise<void> {
    if (retentionDays < 1 || retentionDays > 3650) return;

    const confirmed = window.confirm(
      `¿Eliminar todos los logs de uso de IA y APIs externas con más de ${retentionDays} días? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    setPurging(true);
    try {
      const result = await purgeOldLogs(retentionDays);
      setLastResult(result);
      toast.success(
        `Purga completada: ${result.aiLogsDeleted} logs IA + ${result.externalLogsDeleted} logs API eliminados.`,
      );
    } catch {
      toast.error('No se pudo ejecutar la purga.');
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-text-muted mt-1 text-sm">Configuración general de la aplicación.</p>
      </div>

      <div className="border-border bg-surface rounded-lg border shadow-sm">
        <div className="border-border border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Retención de datos</h2>
          <p className="text-text-muted mt-1 text-sm">
            Purga los registros de uso de IA y APIs externas más antiguos que el periodo
            configurado. Los datos de contactos y empresas no se ven afectados.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="retention-days" className="text-sm font-medium">
                Retención (días)
              </label>
              <input
                id="retention-days"
                type="number"
                min={1}
                max={3650}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="border-border bg-bg h-10 w-32 rounded-md border px-3 text-sm outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handlePurge}
              disabled={purging || retentionDays < 1 || retentionDays > 3650}
              className="bg-danger h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {purging ? 'Purgando…' : 'Purgar ahora'}
            </button>
          </div>

          {lastResult !== null ? (
            <div className="border-border bg-surface-muted rounded-md border px-4 py-3 text-sm">
              Última purga: <span className="font-medium">{lastResult.aiLogsDeleted}</span> logs IA
              + <span className="font-medium">{lastResult.externalLogsDeleted}</span> logs API
              eliminados.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getAiUsage } from '@/lib/api/admin';

function formatUsd(value: number): string {
  return `${value.toFixed(4)} USD`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('es-ES');
}

function formatDate(input: string): string {
  return new Date(input).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function MetricCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="border-border bg-surface rounded-lg border p-5 shadow-sm">
      <p className="text-text-muted text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function LoadingSection({ rows = 4 }: { rows?: number }): JSX.Element {
  return (
    <div className="border-border bg-surface rounded-lg border shadow-sm">
      <div className="space-y-3 p-5">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="bg-surface-muted h-12 animate-pulse rounded-md" />
        ))}
      </div>
    </div>
  );
}

export default function AdminAiCostsPage(): JSX.Element {
  const [days, setDays] = useState(30);

  const usageQuery = useQuery({
    queryKey: ['admin-ai-usage', days],
    queryFn: () => getAiUsage(days),
  });

  const usage = usageQuery.data;
  const byDay = [...(usage?.byDay ?? [])]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Costes de IA</h1>
          <p className="text-text-muted mt-1 text-sm">
            Uso y coste de llamadas a modelos de lenguaje.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {[7, 30, 90].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              className={`h-10 rounded-md px-4 text-sm font-medium transition ${
                days === value
                  ? 'bg-accent text-white hover:opacity-90'
                  : 'border-border bg-surface-muted hover:bg-bg border'
              }`}
            >
              {value} días
            </button>
          ))}
        </div>
      </div>

      {usageQuery.isLoading ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="border-border bg-surface rounded-lg border p-5 shadow-sm">
                <div className="bg-surface-muted h-4 w-24 animate-pulse rounded" />
                <div className="bg-surface-muted mt-3 h-9 w-32 animate-pulse rounded" />
              </div>
            ))}
          </div>
          <LoadingSection rows={5} />
          <LoadingSection rows={4} />
          <LoadingSection rows={4} />
        </>
      ) : usageQuery.isError ? (
        <div className="border-border bg-surface rounded-lg border p-8 text-center shadow-sm">
          <p className="text-sm">No se pudo cargar el uso de IA.</p>
        </div>
      ) : usage && usage.totalCalls === 0 ? (
        <div className="border-border bg-surface rounded-lg border p-8 text-center shadow-sm">
          <p className="text-sm">Sin registros de uso en este periodo.</p>
        </div>
      ) : usage ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total coste" value={formatUsd(usage.totalCostUsd)} />
            <MetricCard label="Total llamadas" value={formatNumber(usage.totalCalls)} />
            <MetricCard label="Total tokens entrada" value={formatNumber(usage.totalInputTokens)} />
            <MetricCard label="Total tokens salida" value={formatNumber(usage.totalOutputTokens)} />
          </div>

          <div className="border-border bg-surface rounded-lg border shadow-sm">
            <div className="border-border border-b px-5 py-4">
              <h2 className="text-lg font-semibold">Por funcionalidad</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-border text-text-muted border-b text-left">
                  <tr>
                    <th className="px-5 py-3 font-medium">Feature</th>
                    <th className="px-5 py-3 font-medium">Llamadas</th>
                    <th className="px-5 py-3 font-medium">Tokens entrada</th>
                    <th className="px-5 py-3 font-medium">Tokens salida</th>
                    <th className="px-5 py-3 font-medium">Coste (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byFeature.map((item) => (
                    <tr key={item.feature} className="border-border border-b last:border-b-0">
                      <td className="px-5 py-4 font-medium">{item.feature}</td>
                      <td className="text-text-muted px-5 py-4">{formatNumber(item.calls)}</td>
                      <td className="text-text-muted px-5 py-4">
                        {formatNumber(item.inputTokens)}
                      </td>
                      <td className="text-text-muted px-5 py-4">
                        {formatNumber(item.outputTokens)}
                      </td>
                      <td className="text-text-muted px-5 py-4">{formatUsd(item.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-border bg-surface rounded-lg border shadow-sm">
            <div className="border-border border-b px-5 py-4">
              <h2 className="text-lg font-semibold">Por modelo</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-border text-text-muted border-b text-left">
                  <tr>
                    <th className="px-5 py-3 font-medium">Modelo</th>
                    <th className="px-5 py-3 font-medium">Llamadas</th>
                    <th className="px-5 py-3 font-medium">Coste (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byModel.map((item) => (
                    <tr key={item.model} className="border-border border-b last:border-b-0">
                      <td className="px-5 py-4 font-medium">{item.model}</td>
                      <td className="text-text-muted px-5 py-4">{formatNumber(item.calls)}</td>
                      <td className="text-text-muted px-5 py-4">{formatUsd(item.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-border bg-surface rounded-lg border shadow-sm">
            <div className="border-border border-b px-5 py-4">
              <h2 className="text-lg font-semibold">Por día</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-border text-text-muted border-b text-left">
                  <tr>
                    <th className="px-5 py-3 font-medium">Fecha</th>
                    <th className="px-5 py-3 font-medium">Llamadas</th>
                    <th className="px-5 py-3 font-medium">Coste (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map((item) => (
                    <tr key={item.date} className="border-border border-b last:border-b-0">
                      <td className="px-5 py-4 font-medium">{formatDate(item.date)}</td>
                      <td className="text-text-muted px-5 py-4">{formatNumber(item.calls)}</td>
                      <td className="text-text-muted px-5 py-4">{formatUsd(item.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import {
  importCompaniesCsv,
  isImportCapError,
  isImportHeaderError,
  type ImportResultDto,
} from '@/lib/api/imports';
import { ApiError } from '@/lib/api/client';

interface ImportCompaniesDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type ImportStep = 'upload' | 'preview' | 'result';

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_ERROR_ROWS = 50;

function counterTone(active: boolean, tone: 'blue' | 'green' | 'amber' | 'red'): string {
  if (!active && tone !== 'blue') return 'text-text-muted';

  switch (tone) {
    case 'blue':
      return 'text-blue-500';
    case 'green':
      return 'text-green-600';
    case 'amber':
      return 'text-amber-500';
    case 'red':
      return 'text-red-500';
  }
}

function renderErrorMessage(err: unknown): string {
  if (isImportCapError(err)) {
    return 'El archivo supera el máximo de 1.000 filas permitido.';
  }

  if (isImportHeaderError(err)) {
    return 'Faltan cabeceras obligatorias en el CSV.';
  }

  if (err instanceof ApiError && err.message) {
    return err.message;
  }

  return 'No se pudo procesar el archivo CSV.';
}

function SummaryChips({ result }: { result: ImportResultDto }): JSX.Element {
  const chips = [
    { label: 'Total', value: result.rows_total, tone: 'blue' as const, active: true },
    {
      label: 'A crear',
      value: result.rows_created,
      tone: 'green' as const,
      active: result.rows_created > 0,
    },
    {
      label: 'Duplicados',
      value: result.rows_skipped_duplicate,
      tone: 'amber' as const,
      active: result.rows_skipped_duplicate > 0,
    },
    {
      label: 'Con errores',
      value: result.rows_failed,
      tone: 'red' as const,
      active: result.rows_failed > 0,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className={`border-border bg-surface-muted rounded-lg border px-4 py-3 ${counterTone(
            chip.active,
            chip.tone,
          )}`}
        >
          <p className="text-xs font-medium uppercase tracking-wide">{chip.label}</p>
          <p className="mt-1 text-2xl font-semibold">{chip.value}</p>
        </div>
      ))}
    </div>
  );
}

function ErrorTable({ errors }: { errors: ImportResultDto['errors'] }): JSX.Element | null {
  if (errors.length === 0) return null;

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div className="max-h-72 overflow-y-auto">
        <table className="min-w-full text-sm">
          <thead className="border-border bg-surface-muted text-text-muted sticky top-0 border-b text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Fila</th>
              <th className="px-4 py-3 font-medium">Campo</th>
              <th className="px-4 py-3 font-medium">Mensaje</th>
            </tr>
          </thead>
          <tbody>
            {errors.slice(0, MAX_ERROR_ROWS).map((error, index) => (
              <tr
                key={`${error.row}-${error.field ?? 'row'}-${index}`}
                className="border-border border-b last:border-b-0"
              >
                <td className="px-4 py-3 align-top">{error.row}</td>
                <td className="text-text-muted px-4 py-3 align-top">{error.field ?? '—'}</td>
                <td className="px-4 py-3 align-top">{error.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ImportCompaniesDialog({
  open,
  onClose,
  onImported,
}: ImportCompaniesDialogProps): JSX.Element | null {
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<ImportResultDto | null>(null);
  const [finalResult, setFinalResult] = useState<ImportResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setStep('upload');
    setFile(null);
    setPreviewResult(null);
    setFinalResult(null);
    setLoading(false);
    setClientError(null);
  }, [open]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const selectedFile = event.target.files?.[0] ?? null;
    setPreviewResult(null);
    setFinalResult(null);

    if (!selectedFile) {
      setFile(null);
      setClientError(null);
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      setClientError('Solo se admiten archivos .csv');
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setFile(null);
      setClientError('El archivo no puede superar 2 MB');
      return;
    }

    setClientError(null);
    setFile(selectedFile);
  }

  async function handleValidate(): Promise<void> {
    if (!file) return;

    setLoading(true);
    setClientError(null);
    try {
      const result = await importCompaniesCsv(file, true);
      setPreviewResult(result);
      setStep('preview');
    } catch (err) {
      setClientError(renderErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(): Promise<void> {
    if (!file || !previewResult) return;

    setLoading(true);
    setClientError(null);
    try {
      const result = await importCompaniesCsv(file, false);
      setFinalResult(result);
      setStep('result');
      toast.success(`Importación completada: ${result.rows_created} empresa(s) creada(s).`);
      onImported();
    } catch (err) {
      setClientError(renderErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const importCount = previewResult?.rows_created ?? 0;
  const uploadButtonLabel = loading ? 'Validando…' : 'Validar';
  const importButtonLabel = loading ? 'Importando…' : `Importar ${importCount} empresas`;

  return (
    <Modal open={open} onClose={onClose} title="Importar empresas desde CSV" size="lg">
      <div className="space-y-5">
        {step === 'upload' ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="companies-import-file" className="block text-sm font-medium">
                Archivo CSV
              </label>
              <input
                id="companies-import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                disabled={loading}
                className="border-border bg-bg file:bg-surface-muted file:border-border h-11 w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <a
                href="/templates/companies-template.csv"
                download
                className="w-fit underline underline-offset-4"
              >
                Descargar plantilla
              </a>
              <p className="text-text-muted">
                Separador: coma (,). Cabecera mínima: name. Máx. 1.000 filas, 2 MB.
              </p>
              {file ? <p className="text-text-muted">Archivo seleccionado: {file.name}</p> : null}
            </div>
          </>
        ) : null}

        {step === 'preview' && previewResult ? (
          <>
            <SummaryChips result={previewResult} />
            {previewResult.errors.length > 0 ? <ErrorTable errors={previewResult.errors} /> : null}
          </>
        ) : null}

        {step === 'result' && finalResult ? (
          <>
            <SummaryChips result={finalResult} />
            {finalResult.errors.length > 0 ? (
              <>
                <p className="text-sm text-red-500">
                  {finalResult.rows_failed} fila(s) no se importaron.
                </p>
                <ErrorTable errors={finalResult.errors} />
              </>
            ) : null}
          </>
        ) : null}

        {clientError ? <p className="text-danger text-sm">{clientError}</p> : null}

        <div className="flex justify-end gap-3">
          {(step === 'upload' || step === 'preview') && (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
          )}

          {step === 'result' ? (
            <button
              type="button"
              onClick={onClose}
              className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cerrar
            </button>
          ) : null}

          {step === 'upload' ? (
            <button
              type="button"
              onClick={() => void handleValidate()}
              disabled={!file || loading}
              className="bg-primary h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadButtonLabel}
            </button>
          ) : null}

          {step === 'preview' ? (
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={importCount === 0 || loading}
              className="bg-primary h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importButtonLabel}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

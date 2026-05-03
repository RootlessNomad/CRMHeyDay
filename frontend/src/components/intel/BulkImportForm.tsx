'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { bulkImportCsv } from '@/lib/api/intel';

interface BulkImportFormProps {
  onBatchCreated: (runIds: string[]) => void;
}
const MAX_FILE_SIZE = 2 * 1024 * 1024;

function downloadTemplate(): void {
  const blob = new Blob(['name,website\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla-bulk.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function BulkImportForm({ onBatchCreated }: BulkImportFormProps): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function buildSuccessMessage(
    count: number,
    errors: Array<{ row: number; message: string }>,
  ): string {
    if (errors.length === 0) {
      return `${count} empresas en cola`;
    }

    const errorLines = errors.map((error) => `Fila ${error.row}: ${error.message}`).join('\n');
    return `${count} empresas en cola\n${errorLines}`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!file) {
      toast.error('Selecciona un archivo CSV para continuar.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('El archivo no puede superar 2 MB.');
      return;
    }

    setLoading(true);

    try {
      const result = await bulkImportCsv(file);
      onBatchCreated(result.run_ids);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      toast.success(buildSuccessMessage(result.count, result.errors));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo importar el CSV.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border bg-surface space-y-4 rounded-2xl border p-6 shadow-sm"
    >
      <div className="space-y-2">
        <label htmlFor="bulk-import-csv" className="text-sm font-medium">
          Archivo CSV
        </label>
        <input
          id="bulk-import-csv"
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={loading}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
          }}
          className="border-border bg-bg file:bg-surface-muted file:border-border h-11 w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <p className="text-text-muted text-sm">
          Formato esperado: columnas <code>name</code> y <code>website</code>. Máx. 100 filas y 2
          MB.
        </p>
        {file ? <p className="text-text-muted text-sm">Archivo seleccionado: {file.name}</p> : null}
      </div>

      <div className="flex items-center justify-between gap-4">
        <a
          href="#"
          onClick={(event) => {
            event.preventDefault();
            downloadTemplate();
          }}
          className="text-sm underline underline-offset-4"
        >
          Descargar plantilla
        </a>

        <button
          type="submit"
          disabled={loading}
          className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Importando...' : 'Importar CSV'}
        </button>
      </div>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { createEnrichmentRun } from '@/lib/api/intel';

interface StartResearchFormProps {
  onRunCreated: (runId: string, companyId: string) => void;
}

function validateCompanyUrl(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return 'Pega una URL para iniciar la investigación.';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'La URL debe empezar por http:// o https://.';
    }
  } catch {
    return 'Introduce una URL válida con http:// o https://.';
  }

  return null;
}

export function StartResearchForm({ onRunCreated }: StartResearchFormProps): JSX.Element {
  const [inputUrl, setInputUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const error = validateCompanyUrl(inputUrl);
    if (error) {
      setValidationError(error);
      toast.error(error);
      return;
    }

    setLoading(true);
    setValidationError(null);

    try {
      const response = await createEnrichmentRun({ input_url: inputUrl.trim() });
      onRunCreated(response.run_id, response.company_id);
      toast.success('Investigación iniciada');
      setInputUrl('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo iniciar la investigación.');
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
        <label htmlFor="company-url" className="text-sm font-medium">
          URL de la empresa
        </label>
        <textarea
          id="company-url"
          value={inputUrl}
          onChange={(event) => {
            setInputUrl(event.target.value);
            if (validationError) {
              setValidationError(null);
            }
          }}
          placeholder="https://cafe-ejemplo.es"
          rows={3}
          aria-invalid={validationError ? 'true' : 'false'}
          aria-describedby={validationError ? 'company-url-error' : undefined}
          className="border-border bg-bg focus:border-accent min-h-28 w-full rounded-xl border px-4 py-3 text-sm outline-none transition"
        />
        <p className="text-text-muted text-sm">
          Usaremos esta URL para lanzar la investigación y generar la ficha enriquecida.
        </p>
        {validationError ? (
          <p id="company-url-error" className="text-sm text-red-600">
            {validationError}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Investigando...' : 'Investigar'}
        </button>
      </div>
    </form>
  );
}

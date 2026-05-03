'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { CHANNEL_LABELS, requestDrafts } from '@/lib/api/content';

interface DraftRequestDialogProps {
  ideaId: string;
  open: boolean;
  onClose: () => void;
  onJobsCreated: (itemIds: string[], jobIds: string[]) => void;
}

type DraftChannelsState = Record<'instagram' | 'linkedin' | 'newsletter', boolean>;

function defaultChannels(): DraftChannelsState {
  return {
    instagram: true,
    linkedin: true,
    newsletter: true,
  };
}

export function DraftRequestDialog({
  ideaId,
  open,
  onClose,
  onJobsCreated,
}: DraftRequestDialogProps): JSX.Element | null {
  const [channels, setChannels] = useState<DraftChannelsState>(defaultChannels());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChannels(defaultChannels());
    setError(null);
  }, [open, ideaId]);

  const mutation = useMutation({
    mutationFn: (selectedChannels: string[]) => requestDrafts(ideaId, selectedChannels),
    onSuccess: (response) => {
      onJobsCreated(
        response.items.map((item) => item.id),
        response.job_ids,
      );
      toast.success(`Generando ${response.job_ids.length} borradores...`);
      onClose();
    },
    onError: (submitError) => {
      toast.error(
        submitError instanceof Error ? submitError.message : 'No se pudieron generar borradores.',
      );
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const selectedChannels = Object.entries(channels)
      .filter(([, checked]) => checked)
      .map(([channel]) => channel);

    if (selectedChannels.length === 0) {
      setError('Selecciona al menos un canal.');
      return;
    }

    setError(null);
    try {
      await mutation.mutateAsync(selectedChannels);
    } catch {
      // El error se maneja en onError para evitar rechazos no capturados.
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Generar borradores multi-canal">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3">
          {(['instagram', 'linkedin', 'newsletter'] as const).map((channel) => (
            <label
              key={channel}
              className="border-border bg-bg flex items-center gap-3 rounded-xl border px-4 py-3"
            >
              <input
                type="checkbox"
                checked={channels[channel]}
                onChange={(event) => {
                  setChannels((current) => ({ ...current, [channel]: event.target.checked }));
                  setError(null);
                }}
                className="accent-accent h-4 w-4"
              />
              <span className="text-sm font-medium">{CHANNEL_LABELS[channel]}</span>
            </label>
          ))}
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? 'Generando...' : 'Generar borradores'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

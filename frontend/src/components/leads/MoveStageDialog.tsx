'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { updateLead } from '@/lib/api/leads';
import type { LeadDto } from '@/types/lead';
import type { PipelineDto, PipelineStageDto } from '@/types/pipeline';

interface MoveStageDialogProps {
  open: boolean;
  onClose: () => void;
  lead: LeadDto | null;
  pipeline: PipelineDto | null;
  onSuccess: (lead: LeadDto) => void;
  onRequestWon?: (lead: LeadDto) => void;
  onRequestLost?: (lead: LeadDto) => void;
}

function sortedStageOptions(
  pipeline: PipelineDto | null,
  currentStageId: string,
): PipelineStageDto[] {
  return [...(pipeline?.stages ?? [])]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .filter((stage) => stage.id !== currentStageId);
}

export function MoveStageDialog({
  open,
  onClose,
  lead,
  pipeline,
  onSuccess,
  onRequestWon,
  onRequestLost,
}: MoveStageDialogProps): JSX.Element | null {
  const options = useMemo(
    () => sortedStageOptions(pipeline, lead?.stageId ?? ''),
    [lead?.stageId, pipeline],
  );
  const [stageId, setStageId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setStageId(options[0]?.id ?? '');
  }, [open, options]);

  async function handleConfirm(): Promise<void> {
    if (!lead) return;
    const nextStage = options.find((stage) => stage.id === stageId);
    if (!nextStage) return;

    if (nextStage.kind === 'won') {
      onClose();
      onRequestWon?.(lead);
      return;
    }

    if (nextStage.kind === 'lost') {
      onClose();
      onRequestLost?.(lead);
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateLead(lead.id, { stageId: nextStage.id });
      toast.success('Stage actualizado.');
      onSuccess(updated);
      onClose();
    } catch {
      toast.error('No se pudo mover el lead de stage.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!lead) return null;

  return (
    <Modal open={open} onClose={onClose} title="Mover lead de stage">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="lead-next-stage" className="block text-sm font-medium">
            Stage destino
          </label>
          <select
            id="lead-next-stage"
            value={stageId}
            onChange={(event) => setStageId(event.target.value)}
            disabled={submitting || options.length === 0}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {options.length === 0 ? (
              <option value="">No hay otros stages disponibles</option>
            ) : (
              options.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="border-border bg-surface-muted hover:bg-bg h-10 rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              void handleConfirm();
            }}
            disabled={submitting || !stageId}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

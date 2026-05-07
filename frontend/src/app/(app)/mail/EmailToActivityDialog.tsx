'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { emailToActivity } from '@/lib/api/mail';

interface EmailToActivityDialogProps {
  open: boolean;
  onClose: () => void;
  accountId: string;
  uid: number;
  folder: string;
  defaultTitle: string;
  defaultBody: string;
}

export function EmailToActivityDialog({
  open,
  onClose,
  accountId,
  uid,
  folder,
  defaultTitle,
  defaultBody,
}: EmailToActivityDialogProps): JSX.Element | null {
  const [entityType, setEntityType] = useState<'contact' | 'lead' | 'company'>('contact');
  const [entityId, setEntityId] = useState('');
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState(defaultBody);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEntityType('contact');
    setEntityId('');
    setTitle(defaultTitle);
    setBody(defaultBody);
    setSubmitting(false);
  }, [defaultBody, defaultTitle, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!entityId.trim()) return;

    setSubmitting(true);
    try {
      await emailToActivity(accountId, {
        folder,
        uid,
        entity_type: entityType,
        entity_id: entityId.trim(),
        title: title.trim() || undefined,
        body: body.trim() || undefined,
      });
      toast.success('Actividad creada.');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear la actividad.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (submitting) return;
        onClose();
      }}
      title="Registrar como actividad en el CRM"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="email-to-activity-entity-type" className="block text-sm font-medium">
            Tipo de entidad
          </label>
          <select
            id="email-to-activity-entity-type"
            value={entityType}
            onChange={(event) =>
              setEntityType(event.target.value as 'contact' | 'lead' | 'company')
            }
            disabled={submitting}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
          >
            <option value="contact">Contacto</option>
            <option value="lead">Lead</option>
            <option value="company">Empresa</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email-to-activity-entity-id" className="block text-sm font-medium">
            ID de entidad
          </label>
          <input
            id="email-to-activity-entity-id"
            type="text"
            value={entityId}
            onChange={(event) => setEntityId(event.target.value)}
            disabled={submitting}
            placeholder="ID de la entidad (p.ej. contacto, lead...)"
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
          />
          <p className="text-text-muted text-xs">
            Copia el ID desde la página del contacto, lead o empresa.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email-to-activity-title" className="block text-sm font-medium">
            Título
          </label>
          <input
            id="email-to-activity-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, 200))}
            maxLength={200}
            disabled={submitting}
            className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email-to-activity-body" className="block text-sm font-medium">
            Descripción
          </label>
          <textarea
            id="email-to-activity-body"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, 1000))}
            maxLength={1000}
            disabled={submitting}
            className="border-border bg-bg focus:border-accent w-full rounded-sm border px-3 py-2.5 text-sm outline-none transition"
          />
        </div>

        <div className="border-border flex items-center justify-end gap-3 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="border-border bg-surface-muted hover:bg-bg rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || !entityId.trim()}
            className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Registrando...' : 'Registrar actividad'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

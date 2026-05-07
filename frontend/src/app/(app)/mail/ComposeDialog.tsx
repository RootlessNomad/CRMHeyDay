'use client';

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import { toast } from 'sonner';

import { Modal } from '@/components/Modal';
import { ApiError } from '@/lib/api/client';
import { sendEmail, type SendEmailInput } from '@/lib/api/mail';

interface ComposeDialogProps {
  open: boolean;
  onClose: () => void;
  accountId: string;
  accountEmail: string;
  signatureHtml?: string | null;
  mode?: 'compose' | 'reply' | 'reply-all' | 'forward';
  originalMessage?: {
    uid: number;
    subject: string | null;
    from: Array<{ name: string | null; address: string | null }>;
    to: Array<{ name: string | null; address: string | null }>;
    cc: Array<{ name: string | null; address: string | null }>;
    replyTo: Array<{ name: string | null; address: string | null }>;
    messageId: string | null;
    date: string | null;
    text: string | null;
    html: string | null;
  };
}

interface AttachmentDraft {
  id: string;
  file: File;
}

interface FieldErrors {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  attachments?: string;
}

const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getDraftKey(accountId: string, mode: string): string {
  return `heyday:mail:draft:${accountId}:${mode}`;
}

function loadDraft(key: string): { to: string; cc: string; bcc: string; subject: string } | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      to?: string;
      cc?: string;
      bcc?: string;
      subject?: string;
      savedAt?: number;
    };
    if (parsed.savedAt && Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return {
      to: parsed.to ?? '',
      cc: parsed.cc ?? '',
      bcc: parsed.bcc ?? '',
      subject: parsed.subject ?? '',
    };
  } catch {
    return null;
  }
}

function saveDraft(
  key: string,
  fields: { to: string; cc: string; bcc: string; subject: string },
): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify({ ...fields, savedAt: Date.now() }));
  } catch {
    // noop
  }
}

function clearDraft(key: string): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function splitEmails(value: string): string[] {
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function validateEmails(value: string): boolean {
  return splitEmails(value).every((email) => EMAIL_PATTERN.test(email));
}

function normalizeSubject(
  subject: string | null,
  mode: NonNullable<ComposeDialogProps['mode']>,
): string {
  const baseSubject = (subject ?? '').trim();
  if (!baseSubject) return '';
  if (mode === 'reply' || mode === 'reply-all') {
    return /^re:\s*/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`;
  }
  if (mode === 'forward') {
    return /^fwd:\s*/i.test(baseSubject) ? baseSubject : `Fwd: ${baseSubject}`;
  }
  return baseSubject;
}

function dedupeAddresses(addresses: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const address of addresses) {
    const normalized = address.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(address.trim());
  }

  return result;
}

function filterOwnAddress(
  addresses: Array<{ address: string | null }>,
  ownEmail: string,
): string[] {
  const own = ownEmail.trim().toLowerCase();
  return dedupeAddresses(
    addresses
      .map((entry) => entry.address?.trim() ?? '')
      .filter((address) => address && address.toLowerCase() !== own),
  );
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildQuotedContent(originalMessage?: ComposeDialogProps['originalMessage']): string {
  if (!originalMessage) return '';

  const sender = originalMessage.from[0];
  const senderLabel =
    sender?.name && sender.address
      ? `${escapeHtml(sender.name)} &lt;${escapeHtml(sender.address)}&gt;`
      : escapeHtml(sender?.name ?? sender?.address ?? '');

  const bodyHtml = originalMessage.html
    ? originalMessage.html
    : `<pre>${escapeHtml(originalMessage.text ?? '')}</pre>`;

  return [
    '<hr/>',
    '<blockquote style="margin-left:1em; padding-left:1em; border-left:3px solid #ccc;">',
    `<p><b>De:</b> ${senderLabel}</p>`,
    `<p><b>Fecha:</b> ${escapeHtml(originalMessage.date ?? '')}</p>`,
    `<p><b>Asunto:</b> ${escapeHtml(originalMessage.subject ?? '')}</p>`,
    '<br/>',
    bodyHtml,
    '</blockquote>',
  ].join('');
}

function buildInitialHtml(
  mode: NonNullable<ComposeDialogProps['mode']>,
  signatureHtml?: string | null,
  originalMessage?: ComposeDialogProps['originalMessage'],
): string {
  const parts = ['<p></p>'];

  if (signatureHtml) {
    parts.push('<hr/>', signatureHtml);
  }

  if (mode !== 'compose' && originalMessage) {
    parts.push(buildQuotedContent(originalMessage));
  }

  return parts.join('');
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('No se pudo leer el archivo.'));
        return;
      }
      const [, base64 = ''] = result.split(',', 2);
      resolve(base64);
    };
    reader.onerror = () => {
      reject(new Error('No se pudo leer el archivo.'));
    };
    reader.readAsDataURL(file);
  });
}

function getDialogTitle(mode: NonNullable<ComposeDialogProps['mode']>): string {
  if (mode === 'reply') return 'Responder';
  if (mode === 'reply-all') return 'Responder a todos';
  if (mode === 'forward') return 'Reenviar';
  return 'Nuevo mensaje';
}

export function ComposeDialog({
  open,
  onClose,
  accountId,
  accountEmail,
  signatureHtml,
  mode = 'compose',
  originalMessage,
}: ComposeDialogProps): JSX.Element {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [hasDraft, setHasDraft] = useState(false);
  const draftKey = getDraftKey(accountId, mode);

  const initialHtml = useMemo(
    () => buildInitialHtml(mode, signatureHtml, originalMessage),
    [mode, originalMessage, signatureHtml],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Placeholder.configure({ placeholder: 'Escribe tu mensaje...' })],
    content: initialHtml,
    editorProps: {
      attributes: {
        class:
          'min-h-[16rem] w-full rounded-md border border-border bg-surface px-3 py-3 text-sm outline-none',
      },
    },
  });

  const totalAttachmentBytes = attachments.reduce(
    (sum, attachment) => sum + attachment.file.size,
    0,
  );
  const inReplyTo =
    (mode === 'reply' || mode === 'reply-all') && originalMessage?.messageId
      ? originalMessage.messageId
      : undefined;
  const references = inReplyTo;

  useEffect(() => {
    if (!open) return;

    const replyTargets =
      mode === 'reply-all'
        ? filterOwnAddress(
            originalMessage && originalMessage.replyTo.length > 0
              ? originalMessage.replyTo
              : (originalMessage?.from ?? []),
            accountEmail,
          )
        : mode === 'reply'
          ? filterOwnAddress(
              originalMessage && originalMessage.replyTo.length > 0
                ? originalMessage.replyTo
                : (originalMessage?.from ?? []),
              accountEmail,
            )
          : [];

    setTo(mode === 'compose' || mode === 'forward' ? '' : replyTargets.join(', '));
    setCc(
      mode === 'reply-all'
        ? filterOwnAddress(originalMessage?.cc ?? [], accountEmail).join(', ')
        : '',
    );
    setBcc('');
    setSubject(normalizeSubject(originalMessage?.subject ?? '', mode));
    setAttachments([]);
    setShowCc(mode === 'reply-all' && (originalMessage?.cc.length ?? 0) > 0);
    setShowBcc(false);
    setErrors({});

    if (editor) {
      editor.commands.setContent(buildInitialHtml(mode, signatureHtml, originalMessage));
    }
  }, [accountEmail, editor, mode, open, originalMessage, signatureHtml]);

  useEffect(() => {
    if (!open) return;

    const draft = loadDraft(draftKey);
    if (!draft) {
      setHasDraft(false);
      return;
    }

    setTo((current) => (current ? current : draft.to));
    setCc((current) => (current ? current : draft.cc));
    setBcc((current) => (current ? current : draft.bcc));
    setSubject((current) => (current ? current : draft.subject));
    setHasDraft(true);
  }, [draftKey, open]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      const fields = { to, cc, bcc, subject };
      const hasContent = Object.values(fields).some((value) => value.trim().length > 0);
      if (!hasContent) {
        clearDraft(draftKey);
        setHasDraft(false);
        return;
      }
      saveDraft(draftKey, fields);
      setHasDraft(true);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [bcc, cc, draftKey, open, subject, to]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error('Editor no disponible');

      const attachmentPayload: NonNullable<SendEmailInput['attachments']> = [];
      for (const attachment of attachments) {
        attachmentPayload.push({
          filename: attachment.file.name,
          content_type: attachment.file.type || 'application/octet-stream',
          data: await readFileAsBase64(attachment.file),
        });
      }

      return sendEmail(accountId, {
        to: splitEmails(to),
        cc: splitEmails(cc),
        bcc: splitEmails(bcc),
        subject: subject.trim(),
        html: editor.getHTML(),
        text: editor.getText(),
        inReplyTo,
        references,
        attachments: attachmentPayload,
      });
    },
    onSuccess: () => {
      clearDraft(draftKey);
      setHasDraft(false);
      toast.success('Mensaje enviado.');
      onClose();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        toast.error(error.message);
        return;
      }

      toast.error(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.');
    },
  });

  function handleClose(): void {
    if (sendMutation.isPending) return;
    onClose();
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setAttachments((current) => [
      ...current,
      ...files.map((file, index) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${current.length + index}`,
        file,
      })),
    ]);
    setErrors((current) => ({ ...current, attachments: undefined }));
    event.target.value = '';
  }

  function removeAttachment(id: string): void {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const nextErrors: FieldErrors = {};
    const toList = splitEmails(to);
    const ccList = splitEmails(cc);
    const bccList = splitEmails(bcc);

    if (toList.length === 0) {
      nextErrors.to = 'Añade al menos un destinatario.';
    } else if (!validateEmails(to)) {
      nextErrors.to = 'Introduce direcciones de correo válidas separadas por comas.';
    }

    if (ccList.length > 0 && !validateEmails(cc)) {
      nextErrors.cc = 'Introduce direcciones de correo válidas separadas por comas.';
    }

    if (bccList.length > 0 && !validateEmails(bcc)) {
      nextErrors.bcc = 'Introduce direcciones de correo válidas separadas por comas.';
    }

    if (!subject.trim()) {
      nextErrors.subject = 'El asunto es obligatorio.';
    }

    if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      nextErrors.attachments = 'El tamaño total de adjuntos no puede superar 25 MB.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    sendMutation.mutate();
  }

  return (
    <Modal open={open} onClose={handleClose} title={getDialogTitle(mode)} size="lg">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="compose-to" className="text-sm font-medium">
              Para
            </label>
            <div className="flex items-center gap-3 text-sm">
              {hasDraft ? (
                <button
                  type="button"
                  onClick={() => {
                    clearDraft(draftKey);
                    setTo('');
                    setCc('');
                    setBcc('');
                    setSubject('');
                    setHasDraft(false);
                  }}
                  className="text-text-muted hover:text-text text-xs underline"
                >
                  Descartar borrador
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowCc((current) => !current)}
                className="text-accent hover:text-accent/80 transition"
              >
                + CC
              </button>
              <button
                type="button"
                onClick={() => setShowBcc((current) => !current)}
                className="text-accent hover:text-accent/80 transition"
              >
                + CCO
              </button>
            </div>
          </div>
          <input
            id="compose-to"
            type="text"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setErrors((current) => ({ ...current, to: undefined }));
            }}
            placeholder="correo@empresa.com, otro@empresa.com"
            className="border-border bg-surface focus:border-accent w-full rounded-md border px-3 py-2.5 text-sm outline-none"
          />
          {errors.to ? <p className="text-danger text-sm">{errors.to}</p> : null}
        </div>

        {showCc ? (
          <div className="space-y-2">
            <label htmlFor="compose-cc" className="text-sm font-medium">
              CC
            </label>
            <input
              id="compose-cc"
              type="text"
              value={cc}
              onChange={(event) => {
                setCc(event.target.value);
                setErrors((current) => ({ ...current, cc: undefined }));
              }}
              placeholder="copia@empresa.com"
              className="border-border bg-surface focus:border-accent w-full rounded-md border px-3 py-2.5 text-sm outline-none"
            />
            {errors.cc ? <p className="text-danger text-sm">{errors.cc}</p> : null}
          </div>
        ) : null}

        {showBcc ? (
          <div className="space-y-2">
            <label htmlFor="compose-bcc" className="text-sm font-medium">
              CCO
            </label>
            <input
              id="compose-bcc"
              type="text"
              value={bcc}
              onChange={(event) => {
                setBcc(event.target.value);
                setErrors((current) => ({ ...current, bcc: undefined }));
              }}
              placeholder="oculto@empresa.com"
              className="border-border bg-surface focus:border-accent w-full rounded-md border px-3 py-2.5 text-sm outline-none"
            />
            {errors.bcc ? <p className="text-danger text-sm">{errors.bcc}</p> : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="compose-subject" className="text-sm font-medium">
            Asunto
          </label>
          <input
            id="compose-subject"
            type="text"
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setErrors((current) => ({ ...current, subject: undefined }));
            }}
            className="border-border bg-surface focus:border-accent w-full rounded-md border px-3 py-2.5 text-sm outline-none"
          />
          {errors.subject ? <p className="text-danger text-sm">{errors.subject}</p> : null}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Mensaje</label>
          <div className="border-border bg-surface rounded-md border">
            <EditorContent editor={editor} />
          </div>
        </div>

        <div className="space-y-3">
          <label htmlFor="compose-attachments" className="text-sm font-medium">
            Adjuntos
          </label>
          <input
            id="compose-attachments"
            type="file"
            multiple
            accept="*/*"
            onChange={handleAttachmentChange}
            className="text-sm"
          />
          {attachments.length > 0 ? (
            <div className="space-y-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="bg-surface-muted flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{attachment.file.name}</p>
                    <p className="text-text-muted">{formatAttachmentSize(attachment.file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="text-danger hover:text-danger/80 shrink-0 transition"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <p className="text-text-muted text-xs">
            Máximo total: {formatAttachmentSize(MAX_TOTAL_ATTACHMENT_BYTES)}.
          </p>
          {errors.attachments ? <p className="text-danger text-sm">{errors.attachments}</p> : null}
        </div>

        <div className="border-border flex items-center justify-end gap-3 border-t pt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={sendMutation.isPending}
            className="border-border bg-surface-muted hover:bg-bg rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={sendMutation.isPending || splitEmails(to).length === 0}
            className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sendMutation.isPending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

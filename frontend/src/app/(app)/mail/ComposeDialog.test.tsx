/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type * as ReactModule from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
}));

vi.mock('@/lib/api/mail', () => ({
  sendEmail: sendEmailMock,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/Modal', () => ({
  Modal: ({ open, children, title }: { open: boolean; children: ReactNode; title: string }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

vi.mock('@tiptap/starter-kit', () => ({ default: {} }));
vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: () => ({}) },
}));

vi.mock('@tiptap/react', async () => {
  const React = (await vi.importActual('react')) as Pick<typeof ReactModule, 'useRef' | 'useState'>;

  return {
    EditorContent: ({ editor }: { editor: MockEditor | null }) => {
      if (!editor) return null;

      return (
        <textarea
          aria-label="Editor de mensaje"
          value={editor.getHTML()}
          onChange={(event) => editor.commands.setContent(event.target.value)}
        />
      );
    },
    useEditor: ({ content }: { content?: string }) => {
      const initialContent = typeof content === 'string' ? content : '';
      const [, setVersion] = React.useState(0);
      const editorRef = React.useRef<MockEditor | null>(null);

      if (!editorRef.current) {
        let html = initialContent;
        let text = stripHtml(initialContent);

        editorRef.current = {
          getHTML: () => html,
          getText: () => text,
          commands: {
            setContent: (value: string) => {
              html = value;
              text = stripHtml(value);
              setVersion((current) => current + 1);
            },
          },
        };
      }

      return editorRef.current;
    },
  };
});

interface MockEditor {
  getHTML: () => string;
  getText: () => string;
  commands: {
    setContent: (value: string) => void;
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

const { ComposeDialog } = await import('./ComposeDialog');

function renderWithProviders(node: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function buildOriginalMessage(
  overrides: Partial<ComponentProps<typeof ComposeDialog>['originalMessage']> = {},
) {
  return {
    uid: 42,
    subject: 'Quarterly update',
    from: [{ name: 'Ana', address: 'ana@example.com' }],
    to: [{ name: 'Alex', address: 'alex@heyday.test' }],
    cc: [{ name: 'Luis', address: 'luis@example.com' }],
    replyTo: [],
    messageId: '<msg-1@example.com>',
    date: '2026-05-07T12:00:00.000Z',
    text: 'Hola',
    html: '<p>Hola</p>',
    ...overrides,
  };
}

function renderDialog(overrides: Partial<ComponentProps<typeof ComposeDialog>> = {}) {
  renderWithProviders(
    <ComposeDialog
      open={true}
      onClose={vi.fn()}
      accountId="acc_1"
      accountEmail="alex@heyday.test"
      signatureHtml="<p>Firma</p>"
      mode="compose"
      {...overrides}
    />,
  );
}

describe('ComposeDialog', () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
  });

  it('renderiza el título Nuevo mensaje en modo compose', () => {
    renderDialog();

    expect(screen.getByText('Nuevo mensaje')).toBeInTheDocument();
  });

  it('renderiza el título Responder en modo reply', () => {
    renderDialog({ mode: 'reply', originalMessage: buildOriginalMessage() });

    expect(screen.getByText('Responder')).toBeInTheDocument();
  });

  it('renderiza el título Reenviar en modo forward', () => {
    renderDialog({ mode: 'forward', originalMessage: buildOriginalMessage() });

    expect(screen.getByText('Reenviar')).toBeInTheDocument();
  });

  it('prefill de Para usa el remitente en reply', () => {
    renderDialog({ mode: 'reply', originalMessage: buildOriginalMessage() });

    expect(screen.getByLabelText('Para')).toHaveValue('ana@example.com');
  });

  it('prefill de asunto añade Re: sin duplicarlo en reply', () => {
    renderDialog({
      mode: 'reply',
      originalMessage: buildOriginalMessage({ subject: 'Re: Quarterly update' }),
    });

    expect(screen.getByLabelText('Asunto')).toHaveValue('Re: Quarterly update');
  });

  it('prefill de asunto añade Fwd: en forward', () => {
    renderDialog({ mode: 'forward', originalMessage: buildOriginalMessage() });

    expect(screen.getByLabelText('Asunto')).toHaveValue('Fwd: Quarterly update');
  });

  it('desactiva Enviar cuando Para está vacío en compose', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });
});

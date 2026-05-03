/// <reference types="@testing-library/jest-dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as ReactModule from 'react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentEditor } from './ContentEditor';

const createVersionMock = vi.fn();
const getContentItemMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock('@/lib/api/content', async () => {
  const actual = await vi.importActual('@/lib/api/content');
  return {
    ...(actual as object),
    createVersion: (...args: unknown[]) => createVersionMock(...args),
    getContentItem: (...args: unknown[]) => getContentItemMock(...args),
  };
});

vi.mock('@tiptap/starter-kit', () => ({ default: {} }));
vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-character-count', () => ({ default: {} }));

vi.mock('@tiptap/react', async () => {
  const React = (await vi.importActual('react')) as Pick<typeof ReactModule, 'useRef' | 'useState'>;

  return {
    EditorContent: ({ editor }: { editor: MockEditor | null }) => {
      if (!editor) return null;

      return (
        <textarea
          aria-label="Editor de contenido"
          value={editor.getText()}
          onChange={(event) => editor.commands.setContent(event.target.value)}
        />
      );
    },
    useEditor: ({
      content,
      onUpdate,
    }: {
      content?: string;
      onUpdate?: ({ editor }: { editor: MockEditor }) => void;
    }) => {
      const initialText = typeof content === 'string' ? stripHtml(content) : '';
      const [, setVersion] = React.useState(0);
      const editorRef = React.useRef<MockEditor | null>(null);

      if (!editorRef.current) {
        let text = initialText;

        editorRef.current = {
          getText: () => text,
          commands: {
            setContent: (value: string) => {
              text = stripHtml(value);
              setVersion((current) => current + 1);
              onUpdate?.({ editor: editorRef.current! });
            },
          },
          storage: {
            characterCount: {
              characters: () => text.length,
            },
          },
        };
      }

      return editorRef.current;
    },
  };
});

interface MockEditor {
  getText: () => string;
  commands: {
    setContent: (value: string) => void;
  };
  storage: {
    characterCount: {
      characters: () => number;
    };
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

function buildItem(body: string) {
  return {
    id: 'item_1',
    idea_id: 'idea_1',
    channel: 'linkedin' as const,
    status: 'draft' as const,
    scheduled_for: null,
    current_version_id: 'version_2',
    current_version: {
      id: 'version_2',
      item_id: 'item_1',
      version_number: 2,
      title: null,
      body,
      hooks: [],
      ctas: [],
      hashtags: [],
      generated_by: 'human' as const,
      edited_by_id: 'user_1',
      created_at: '2026-05-03T10:00:00.000Z',
    },
    versions: [],
    created_by_id: 'user_1',
    created_at: '2026-05-03T09:00:00.000Z',
    updated_at: '2026-05-03T10:00:00.000Z',
  };
}

function renderWithProviders(node: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return client;
}

describe('ContentEditor', () => {
  beforeEach(() => {
    createVersionMock.mockReset();
    getContentItemMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    getContentItemMock.mockResolvedValue(buildItem('Texto inicial'));
  });

  it('renderiza el editor con el contenido inicial', async () => {
    renderWithProviders(
      <ContentEditor
        itemId="item_1"
        initialVersion={{
          id: 'version_1',
          item_id: 'item_1',
          version_number: 1,
          title: null,
          body: 'Texto inicial',
          hooks: [],
          ctas: [],
          hashtags: [],
          generated_by: 'human',
          edited_by_id: 'user_1',
          created_at: '2026-05-03T09:00:00.000Z',
        }}
      />,
    );

    expect((await screen.findAllByDisplayValue('Texto inicial')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Texto inicial').length).toBeGreaterThan(0);
  });

  it('el botón Guardar versión llama createVersion con el body actual', async () => {
    createVersionMock.mockResolvedValue({
      id: 'version_3',
      item_id: 'item_1',
      version_number: 3,
    });

    renderWithProviders(
      <ContentEditor
        itemId="item_1"
        initialVersion={{
          id: 'version_1',
          item_id: 'item_1',
          version_number: 1,
          title: null,
          body: 'Texto inicial',
          hooks: [],
          ctas: [],
          hashtags: [],
          generated_by: 'human',
          edited_by_id: 'user_1',
          created_at: '2026-05-03T09:00:00.000Z',
        }}
      />,
    );

    fireEvent.change((await screen.findAllByLabelText('Editor de contenido'))[0]!, {
      target: { value: 'Nuevo cuerpo' },
    });

    await waitFor(() => {
      expect(screen.getAllByDisplayValue('Nuevo cuerpo').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Guardar versión' })[0]!);

    await waitFor(() => {
      expect(createVersionMock).toHaveBeenCalledWith('item_1', { body: 'Nuevo cuerpo' });
    });
  });

  it('el estado pendiente muestra Guardando… y desactiva el botón', async () => {
    createVersionMock.mockImplementation(() => new Promise(() => undefined));

    renderWithProviders(
      <ContentEditor
        itemId="item_1"
        initialVersion={{
          id: 'version_1',
          item_id: 'item_1',
          version_number: 1,
          title: null,
          body: 'Texto inicial',
          hooks: [],
          ctas: [],
          hashtags: [],
          generated_by: 'human',
          edited_by_id: 'user_1',
          created_at: '2026-05-03T09:00:00.000Z',
        }}
      />,
    );

    fireEvent.click((await screen.findAllByRole('button', { name: 'Guardar versión' }))[0]!);

    expect((await screen.findAllByRole('button', { name: 'Guardando…' }))[0]!).toBeDisabled();
  });

  it('onSuccess muestra toast y hace invalidate', async () => {
    createVersionMock.mockResolvedValue({
      id: 'version_3',
      item_id: 'item_1',
      version_number: 3,
    });

    const client = renderWithProviders(
      <ContentEditor
        itemId="item_1"
        initialVersion={{
          id: 'version_1',
          item_id: 'item_1',
          version_number: 1,
          title: null,
          body: 'Texto inicial',
          hooks: [],
          ctas: [],
          hashtags: [],
          generated_by: 'human',
          edited_by_id: 'user_1',
          created_at: '2026-05-03T09:00:00.000Z',
        }}
      />,
    );
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    fireEvent.click((await screen.findAllByRole('button', { name: 'Guardar versión' }))[0]!);

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Versión guardada');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['content', 'item', 'item_1'] });
  });
});

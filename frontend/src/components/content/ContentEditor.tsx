'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import { toast } from 'sonner';

import { Tabs, TabsList, TabsPanel, TabsTrigger } from '@/components/Tabs';
import { createVersion, getContentItem, type ContentVersionDto } from '@/lib/api/content';

interface ContentEditorProps {
  itemId: string;
  initialVersion: ContentVersionDto | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function textToEditorHtml(value: string): string {
  if (!value.trim()) return '<p></p>';

  return value
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function ContentEditor({ itemId, initialVersion }: ContentEditorProps): JSX.Element {
  const queryClient = useQueryClient();
  const [currentBody, setCurrentBody] = useState(initialVersion?.body ?? '');

  const itemQuery = useQuery({
    queryKey: ['content', 'item', itemId],
    queryFn: () => getContentItem(itemId),
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Escribe tu contenido aquí…' }),
      CharacterCount,
    ],
    content: textToEditorHtml(initialVersion?.body ?? ''),
    onUpdate: ({ editor: currentEditor }) => {
      setCurrentBody(currentEditor.getText());
    },
    editorProps: {
      attributes: {
        class:
          'min-h-[24rem] w-full rounded-xl border border-border bg-surface px-4 py-4 text-sm outline-none',
      },
    },
  });

  const currentVersion = itemQuery.data?.current_version ?? initialVersion;

  useEffect(() => {
    const nextBody = currentVersion?.body ?? '';
    setCurrentBody(nextBody);

    if (!editor) return;
    if (editor.getText() === nextBody) return;

    editor.commands.setContent(textToEditorHtml(nextBody));
  }, [currentVersion, editor]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error('Editor no disponible');
      return createVersion(itemId, { body: editor.getText() });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['content', 'item', itemId] });
      toast.success('Versión guardada');
    },
    onError: () => {
      toast.error('No se pudo guardar');
    },
  });

  const characterCount =
    typeof editor?.storage.characterCount.characters === 'function'
      ? editor.storage.characterCount.characters()
      : currentBody.length;

  const editorPanel = (
    <section className="border-border bg-surface rounded-2xl border shadow-sm">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Editor</h2>
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={!editor || saveMutation.isPending}
          className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saveMutation.isPending ? 'Guardando…' : 'Guardar versión'}
        </button>
      </div>

      <div className="p-4">
        <EditorContent editor={editor} />
      </div>

      <div className="border-border text-text-muted flex items-center justify-end border-t px-4 py-3 text-xs">
        {characterCount} caracteres
      </div>
    </section>
  );

  const previewPanel = (
    <section className="border-border bg-surface rounded-2xl border shadow-sm">
      <div className="border-border border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Vista previa</h2>
      </div>
      <div className="p-4">
        <div className="prose text-text min-h-[24rem] max-w-none whitespace-pre-wrap font-sans text-sm leading-6">
          {currentBody || 'La vista previa aparecerá aquí.'}
        </div>
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="lg:hidden">
        <Tabs defaultValue="editor">
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsPanel value="editor">{editorPanel}</TabsPanel>
          <TabsPanel value="preview">{previewPanel}</TabsPanel>
        </Tabs>
      </div>

      <div className="hidden gap-6 lg:grid lg:grid-cols-2">
        {editorPanel}
        {previewPanel}
      </div>
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { toast } from 'sonner';

import {
  assignTag,
  createTag,
  isTagAssignmentConflict,
  isTagNameConflict,
  listTags,
  listTagsForEntity,
  unassignTag,
} from '@/lib/api/tags';
import { ApiError } from '@/lib/api/client';
import type { TagDto, TagKind, TaggableEntityType } from '@/types/tag';

import { TagBadge } from './TagBadge';

interface TagPickerProps {
  entityType: TaggableEntityType;
  entityId: string | null;
  disabled?: boolean;
  emptyHint?: string;
}

const TAG_KIND_OPTIONS: TagKind[] = ['general', 'vertical', 'persona', 'service_interest'];

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
}

function isEntityNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function TagPicker({
  entityType,
  entityId,
  disabled = false,
  emptyHint,
}: TagPickerProps): JSX.Element {
  const queryClient = useQueryClient();
  const generatedId = useId();
  const inputId = `tag-picker-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [createKind, setCreateKind] = useState<TagKind>('general');

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
      setHighlightedIndex(-1);
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, []);

  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const assignedTagsQuery = useQuery({
    queryKey: ['tags', 'by-entity', entityType, entityId],
    queryFn: () => listTagsForEntity(entityType, entityId ?? ''),
    enabled: Boolean(entityId),
  });

  const searchTagsQuery = useQuery({
    queryKey: ['tags', 'search', debouncedQuery],
    queryFn: () => listTags({ q: debouncedQuery }),
    enabled: open && debouncedQuery.length >= 1 && Boolean(entityId),
  });

  const assignedTags = assignedTagsQuery.data ?? [];
  const assignedTagIds = useMemo(() => new Set(assignedTags.map((tag) => tag.id)), [assignedTags]);
  const searchResults = useMemo(
    () => (searchTagsQuery.data ?? []).filter((tag) => !assignedTagIds.has(tag.id)),
    [assignedTagIds, searchTagsQuery.data],
  );
  const canCreate = debouncedQuery.length >= 2;
  const optionCount = searchResults.length + (canCreate ? 1 : 0);

  useEffect(() => {
    if (!open || optionCount === 0) {
      setHighlightedIndex(-1);
      return;
    }

    setHighlightedIndex((current) => {
      if (current < 0) return 0;
      return Math.min(current, optionCount - 1);
    });
  }, [open, optionCount]);

  async function invalidateAssignedTags(): Promise<void> {
    if (!entityId) return;
    await queryClient.invalidateQueries({ queryKey: ['tags', 'by-entity', entityType, entityId] });
  }

  async function invalidateSearchTags(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['tags', 'search'] });
  }

  function resetInput(): void {
    setQuery('');
    setOpen(false);
    setHighlightedIndex(-1);
  }

  function handleAssignError(error: unknown): void {
    if (isTagAssignmentConflict(error)) {
      void invalidateAssignedTags();
      return;
    }

    if (isEntityNotFoundError(error)) {
      toast.error('La entidad ya no existe.');
      return;
    }

    toast.error('No se pudo asignar la tag.');
  }

  const assignMutation = useMutation({
    mutationFn: (tagId: string) =>
      assignTag({
        tag_id: tagId,
        entity_type: entityType,
        entity_id: entityId ?? '',
      }),
    onSuccess: async () => {
      await invalidateAssignedTags();
      toast.success('Tag asignada');
      resetInput();
    },
    onError: handleAssignError,
  });

  const createAndAssignMutation = useMutation({
    mutationFn: async ({ name, kind }: { name: string; kind: TagKind }) => {
      const tag = await createTag({ name, kind });
      await assignTag({
        tag_id: tag.id,
        entity_type: entityType,
        entity_id: entityId ?? '',
      });
      return tag;
    },
    onSuccess: async () => {
      await Promise.all([invalidateAssignedTags(), invalidateSearchTags()]);
      toast.success('Tag asignada');
      resetInput();
    },
    onError: async (error) => {
      if (isTagNameConflict(error)) {
        toast.error('Ya existe una tag con ese nombre. Búscala arriba.');
        return;
      }

      if (isTagAssignmentConflict(error)) {
        await invalidateAssignedTags();
        return;
      }

      if (isEntityNotFoundError(error)) {
        toast.error('La entidad ya no existe.');
        return;
      }

      toast.error('No se pudo crear la tag.');
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (tagId: string) =>
      unassignTag({
        tag_id: tagId,
        entity_type: entityType,
        entity_id: entityId ?? '',
      }),
    onSuccess: async () => {
      await invalidateAssignedTags();
      toast.success('Tag quitada');
    },
    onError: (error) => {
      if (isEntityNotFoundError(error)) {
        toast.error('La entidad ya no existe.');
        return;
      }

      toast.error('No se pudo quitar la tag.');
    },
  });

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setQuery(event.target.value);
    setOpen(true);
    setHighlightedIndex(-1);
  }

  function handleAssign(tag: TagDto): void {
    if (disabled || !entityId) return;
    assignMutation.mutate(tag.id);
  }

  function handleCreate(): void {
    if (disabled || !entityId || debouncedQuery.length < 2) return;
    createAndAssignMutation.mutate({ name: debouncedQuery, kind: createKind });
  }

  function handleUnassign(tag: TagDto): void {
    if (disabled || !entityId) return;
    unassignMutation.mutate(tag.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      setOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    if (!open || optionCount === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % optionCount);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => (current <= 0 ? optionCount - 1 : current - 1));
    }

    if (event.key === 'Enter' && highlightedIndex >= 0) {
      event.preventDefault();
      if (highlightedIndex < searchResults.length) {
        const option = searchResults[highlightedIndex];
        if (option) handleAssign(option);
        return;
      }

      if (canCreate) handleCreate();
    }
  }

  if (!entityId) {
    return (
      <p className="text-text-muted text-xs">{emptyHint ?? 'Guarda primero para añadir tags.'}</p>
    );
  }

  const busy =
    assignMutation.isPending || createAndAssignMutation.isPending || unassignMutation.isPending;

  return (
    <div ref={rootRef} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {assignedTagsQuery.isLoading ? (
          <p className="text-text-muted text-xs">Cargando tags…</p>
        ) : assignedTags.length === 0 ? (
          <p className="text-text-muted text-xs">Sin tags asignadas.</p>
        ) : (
          assignedTags.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              onRemove={disabled ? undefined : () => handleUnassign(tag)}
            />
          ))
        )}
      </div>

      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={query}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled || busy}
          placeholder="Buscar o crear tag…"
          className="border-border bg-bg focus:border-accent h-10 w-full rounded-sm border px-3 text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
        />

        {open ? (
          <div
            id={listboxId}
            role="listbox"
            className="border-border bg-surface absolute left-0 right-0 top-[calc(100%+0.25rem)] z-20 max-h-72 overflow-auto rounded-md border p-1 shadow-lg"
          >
            {debouncedQuery.length < 1 ? (
              <div className="text-text-muted px-3 py-2 text-sm">Escribe al menos 1 carácter.</div>
            ) : searchTagsQuery.isLoading ? (
              <div className="text-text-muted px-3 py-2 text-sm">Buscando tags…</div>
            ) : searchTagsQuery.isError ? (
              <div className="text-danger px-3 py-2 text-sm">No se pudo cargar el listado.</div>
            ) : (
              <>
                {searchResults.map((tag, index) => {
                  const highlighted = index === highlightedIndex;

                  return (
                    <button
                      key={tag.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => handleAssign(tag)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                        highlighted ? 'bg-accent-soft' : 'hover:bg-surface-muted'
                      }`}
                    >
                      <span className="font-medium">{tag.name}</span>
                      <span className="shrink-0">
                        <TagBadge tag={tag} />
                      </span>
                    </button>
                  );
                })}

                {canCreate ? (
                  <div
                    role="option"
                    aria-selected={highlightedIndex === searchResults.length}
                    className={`rounded-md px-3 py-2 transition ${
                      highlightedIndex === searchResults.length
                        ? 'bg-accent-soft'
                        : 'hover:bg-surface-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={handleCreate}
                        className="min-w-0 flex-1 text-left text-sm"
                      >
                        Crear tag '{debouncedQuery}'
                      </button>
                      <select
                        aria-label="Tipo de tag"
                        value={createKind}
                        onChange={(event) => setCreateKind(event.target.value as TagKind)}
                        onClick={(event) => event.stopPropagation()}
                        className="border-border bg-bg h-8 rounded-sm border px-2 text-xs outline-none"
                      >
                        {TAG_KIND_OPTIONS.map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}

                {searchResults.length === 0 && !canCreate ? (
                  <div className="text-text-muted px-3 py-2 text-sm">No hay resultados.</div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

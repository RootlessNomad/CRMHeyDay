'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { TaxonomyFormDialog } from '@/components/taxonomies/TaxonomyFormDialog';
import { TaxonomyTable, type TaxonomyRow } from '@/components/taxonomies/TaxonomyTable';
import {
  createContentPillar,
  createPainPointCategory,
  createServiceLine,
  listContentPillars,
  listPainPointCategories,
  listServiceLines,
  updateContentPillar,
  updatePainPointCategory,
  updateServiceLine,
  type ContentPillarDto,
  type PainPointCategoryDto,
  type ServiceLineDto,
  type CreateTaxonomyInput,
} from '@/lib/api/taxonomies';
import type { TaxonomySubmitValues } from '@/components/taxonomies/TaxonomyFormDialog';

type Tab = 'pain-points' | 'service-lines' | 'content-pillars';

const TAB_LABELS: Record<Tab, string> = {
  'pain-points': 'Pain Points',
  'service-lines': 'Líneas de servicio',
  'content-pillars': 'Pilares de contenido',
};

const TAB_ENTITY_NAMES: Record<Tab, string> = {
  'pain-points': 'categoría de pain point',
  'service-lines': 'línea de servicio',
  'content-pillars': 'pilar de contenido',
};

export default function AdminTaxonomiesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('pain-points');
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<TaxonomyRow | null>(null);

  const painPointsQuery = useQuery({
    queryKey: ['pain-point-categories'],
    queryFn: listPainPointCategories,
  });
  const serviceLinesQuery = useQuery({ queryKey: ['service-lines'], queryFn: listServiceLines });
  const contentPillarsQuery = useQuery({
    queryKey: ['content-pillars'],
    queryFn: listContentPillars,
  });

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: [activeTab === 'pain-points' ? 'pain-point-categories' : activeTab],
    });
  }

  async function handleToggleActive(item: TaxonomyRow): Promise<void> {
    try {
      if (activeTab === 'pain-points') {
        await updatePainPointCategory(item.id, { isActive: !item.isActive });
      } else if (activeTab === 'service-lines') {
        await updateServiceLine(item.id, { isActive: !item.isActive });
      } else {
        await updateContentPillar(item.id, { isActive: !item.isActive });
      }
      await refresh();
      toast.success(item.isActive ? 'Elemento desactivado.' : 'Elemento activado.');
    } catch {
      toast.error('No se pudo actualizar el elemento.');
    }
  }

  async function handleCreate(values: TaxonomySubmitValues): Promise<void> {
    const input: CreateTaxonomyInput = {
      key: values.key ?? '',
      labelEs: values.labelEs,
      descriptionEs: values.descriptionEs,
    };
    if (activeTab === 'pain-points') {
      await createPainPointCategory(input);
    } else if (activeTab === 'service-lines') {
      await createServiceLine(input);
    } else {
      await createContentPillar(input);
    }
    await refresh();
    setCreateOpen(false);
    toast.success('Elemento añadido.');
  }

  async function handleEdit(values: TaxonomySubmitValues): Promise<void> {
    if (!editItem) return;
    if (activeTab === 'pain-points') {
      await updatePainPointCategory(editItem.id, values);
    } else if (activeTab === 'service-lines') {
      await updateServiceLine(editItem.id, values);
    } else {
      await updateContentPillar(editItem.id, values);
    }
    await refresh();
    setEditItem(null);
    toast.success('Elemento actualizado.');
  }

  function getItems(): TaxonomyRow[] {
    if (activeTab === 'pain-points') {
      return (painPointsQuery.data ?? []) as PainPointCategoryDto[];
    }
    if (activeTab === 'service-lines') {
      return (serviceLinesQuery.data ?? []) as ServiceLineDto[];
    }
    return (contentPillarsQuery.data ?? []) as ContentPillarDto[];
  }

  const currentQuery =
    activeTab === 'pain-points'
      ? painPointsQuery
      : activeTab === 'service-lines'
        ? serviceLinesQuery
        : contentPillarsQuery;

  const items = getItems();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Taxonomías</h1>
          <p className="text-text-muted mt-1 text-sm">
            Edita los catálogos sin necesidad de deploy.
          </p>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Añadir {TAB_ENTITY_NAMES[activeTab]}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-border border-b">
        <nav className="-mb-px flex gap-6">
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 pb-3 text-sm font-medium transition ${
                activeTab === tab
                  ? 'border-accent text-accent'
                  : 'text-text-muted hover:text-fg border-transparent'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>
      </div>

      <div className="border-border bg-surface rounded-lg border shadow-sm">
        {currentQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-surface-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : currentQuery.isError ? (
          <div className="p-8 text-center">
            <p className="text-sm">No se pudieron cargar los elementos.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-text-muted text-sm">
              No hay elementos en este catálogo. Añade el primero.
            </p>
          </div>
        ) : (
          <TaxonomyTable
            items={items}
            onEdit={setEditItem}
            onToggleActive={(item) => {
              void handleToggleActive(item);
            }}
          />
        )}
      </div>

      {/* Create dialog */}
      <TaxonomyFormDialog
        open={createOpen}
        mode="create"
        entityName={TAB_ENTITY_NAMES[activeTab]}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      {/* Edit dialog */}
      <TaxonomyFormDialog
        open={editItem !== null}
        mode="edit"
        entityName={TAB_ENTITY_NAMES[activeTab]}
        initialValues={
          editItem
            ? { labelEs: editItem.labelEs, descriptionEs: editItem.descriptionEs }
            : undefined
        }
        onClose={() => setEditItem(null)}
        onSubmit={handleEdit}
      />
    </div>
  );
}

'use client';

import { use } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import { ApprovalActions } from '@/components/content/ApprovalActions';
import { ContentEditor } from '@/components/content/ContentEditor';
import { VersionHistory } from '@/components/content/VersionHistory';
import { ApiError } from '@/lib/api/client';
import { CHANNEL_LABELS, ITEM_STATUS_LABELS, getContentItem } from '@/lib/api/content';

const STATUS_STYLES: Record<string, string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  in_review: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  exported: 'border-sky-200 bg-sky-50 text-sky-700',
  archived: 'border-border bg-surface-muted text-text-muted',
};

export default function ContentItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): JSX.Element {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const itemQuery = useQuery({
    queryKey: ['content', 'item', id],
    queryFn: () => getContentItem(id),
  });

  if (itemQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-3">
          <div className="bg-surface-muted h-5 w-32 animate-pulse rounded-md" />
          <div className="bg-surface-muted h-10 w-80 animate-pulse rounded-md" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-surface-muted h-[32rem] animate-pulse rounded-2xl" />
          <div className="bg-surface-muted h-[32rem] animate-pulse rounded-2xl" />
        </div>
        <div className="bg-surface-muted h-72 animate-pulse rounded-2xl" />
      </div>
    );
  }

  if (itemQuery.isError) {
    const isNotFound = itemQuery.error instanceof ApiError && itemQuery.error.status === 404;

    return (
      <div className="mx-auto max-w-5xl space-y-4 py-10 text-center">
        <p className="text-lg font-semibold text-red-600">
          {isNotFound ? 'Contenido no encontrado' : 'No se pudo cargar el contenido'}
        </p>
        <Link href="/content/ideas" className="text-sm underline underline-offset-4">
          Volver a ideas
        </Link>
      </div>
    );
  }

  const item = itemQuery.data;

  if (!item) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 py-10 text-center">
        <p className="text-lg font-semibold text-red-600">No se pudo cargar el contenido</p>
        <Link href="/content/ideas" className="text-sm underline underline-offset-4">
          Volver a ideas
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <Link
          href="/content/ideas"
          className="text-text-muted inline-flex text-sm underline underline-offset-4"
        >
          ← Volver a ideas
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {CHANNEL_LABELS[item.channel] ?? item.channel}
            </h1>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                STATUS_STYLES[item.status] ?? STATUS_STYLES['archived']
              }`}
            >
              {ITEM_STATUS_LABELS[item.status] ?? item.status}
            </span>
          </div>
          <ApprovalActions itemId={id} status={item.status} />
        </div>
      </header>

      <ContentEditor itemId={id} initialVersion={item.current_version} />

      <VersionHistory
        itemId={id}
        versions={item.versions}
        currentVersionId={item.current_version_id}
        onRevert={() => {
          void queryClient.invalidateQueries({ queryKey: ['content', 'item', id] });
        }}
      />
    </div>
  );
}

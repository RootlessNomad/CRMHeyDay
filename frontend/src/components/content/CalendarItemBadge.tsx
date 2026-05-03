import { CHANNEL_LABELS } from '@/lib/api/content';

interface CalendarItemBadgeProps {
  channel: 'instagram' | 'linkedin' | 'newsletter';
  status: string;
}

const CHANNEL_STYLES: Record<CalendarItemBadgeProps['channel'], string> = {
  instagram: 'bg-pink-100 text-pink-700',
  linkedin: 'bg-blue-100 text-blue-700',
  newsletter: 'bg-amber-100 text-amber-700',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  approved: 'Aprobado',
  exported: 'Exportado',
  archived: 'Archivado',
};

export function CalendarItemBadge({ channel, status }: CalendarItemBadgeProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHANNEL_STYLES[channel]}`}
      >
        {CHANNEL_LABELS[channel]}
      </span>
      <span className="bg-bg text-text-muted inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium">
        {STATUS_LABELS[status] ?? status}
      </span>
    </div>
  );
}

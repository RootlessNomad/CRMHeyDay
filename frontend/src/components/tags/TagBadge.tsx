'use client';

import type { CSSProperties } from 'react';

import type { TagDto } from '@/types/tag';

interface TagBadgeProps {
  tag: TagDto;
  onRemove?: () => void;
}

const HEX_COLOR_REGEX = /^#[0-9A-F]{6}$/i;

function getTagStyle(color: string | null): CSSProperties | undefined {
  if (!color || !HEX_COLOR_REGEX.test(color)) return undefined;

  return {
    borderColor: color,
    backgroundColor: `${color}22`,
    color,
  };
}

export function TagBadge({ tag, onRemove }: TagBadgeProps): JSX.Element {
  const colored = Boolean(tag.color && HEX_COLOR_REGEX.test(tag.color));
  const style = getTagStyle(tag.color);

  return (
    <span
      title={tag.kind}
      style={style}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
        colored ? '' : 'border-border bg-surface-muted text-text-muted'
      }`}
    >
      <span>{tag.name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="hover:opacity-80"
          aria-label={`Quitar tag ${tag.name}`}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

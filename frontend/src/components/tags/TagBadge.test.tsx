/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TagBadge } from './TagBadge';

describe('TagBadge', () => {
  it('with color applies inline style', () => {
    render(
      <TagBadge
        tag={{
          id: 'tag_1',
          name: 'Healthcare',
          color: '#33AA55',
          kind: 'vertical',
          created_at: new Date().toISOString(),
        }}
      />,
    );

    const badge = screen.getByText('Healthcare').parentElement;
    expect(badge).not.toBeNull();
    expect(badge?.style.borderColor).toBe('rgb(51, 170, 85)');
    expect(badge?.style.backgroundColor).toBe('rgba(51, 170, 85, 0.133)');
    expect(badge?.style.color).toBe('rgb(51, 170, 85)');
  });

  it('without color uses neutral classes', () => {
    render(
      <TagBadge
        tag={{
          id: 'tag_2',
          name: 'General',
          color: null,
          kind: 'general',
          created_at: new Date().toISOString(),
        }}
      />,
    );

    const badge = screen.getByText('General').parentElement;
    expect(badge).not.toBeNull();
    expect(badge).toHaveClass('border-border', 'bg-surface-muted', 'text-text-muted');
    expect(badge?.style.borderColor).toBe('');
    expect(badge?.style.backgroundColor).toBe('');
    expect(badge?.style.color).toBe('');
  });
});

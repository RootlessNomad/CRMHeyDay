/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CalendarItemBadge } from './CalendarItemBadge';

describe('CalendarItemBadge', () => {
  it('renders channel badge with correct label', () => {
    render(<CalendarItemBadge channel="instagram" status="draft" />);

    expect(screen.getByText('Instagram')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<CalendarItemBadge channel="linkedin" status="in_review" />);

    expect(screen.getByText('En revisión')).toBeInTheDocument();
  });
});

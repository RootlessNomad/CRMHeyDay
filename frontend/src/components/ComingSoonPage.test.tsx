/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ComingSoonPage } from './ComingSoonPage';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('ComingSoonPage', () => {
  it('renderiza título, descripción y milestone', () => {
    render(
      <ComingSoonPage
        title="Actividades"
        description="Vista global de actividades."
        milestone="M2"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Actividades' })).toBeInTheDocument();
    expect(screen.getByText('Vista global de actividades.')).toBeInTheDocument();
    expect(screen.getByText('M2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver/i })).toHaveAttribute('href', '/');
  });
});

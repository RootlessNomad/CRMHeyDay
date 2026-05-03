/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IdeaCard } from './IdeaCard';

const idea = {
  id: 'idea_1',
  title: 'Campaña para otoño',
  angle: 'Vincular recuperación y vuelta a la rutina',
  pillar_id: 'pillar_1',
  pillar_label: 'Educación',
  service_line_id: null,
  icp_vertical: 'pilates',
  brief_es: 'Brief',
  status: 'idea',
  created_by_id: 'user_1',
  created_at: '2026-05-03T10:00:00.000Z',
  updated_at: '2026-05-03T10:00:00.000Z',
  items_count: 0,
};

describe('IdeaCard', () => {
  it('renderiza título, ángulo y badge de estado', () => {
    render(<IdeaCard idea={idea} onEdit={vi.fn()} onDelete={vi.fn()} onGenerateDrafts={vi.fn()} />);

    expect(screen.getByText('Campaña para otoño')).toBeInTheDocument();
    expect(screen.getByText('Vincular recuperación y vuelta a la rutina')).toBeInTheDocument();
    expect(screen.getByText('Idea')).toBeInTheDocument();
  });

  it("click en 'Generar borradores' llama onGenerateDrafts", () => {
    const onGenerateDrafts = vi.fn();

    render(
      <IdeaCard
        idea={idea}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onGenerateDrafts={onGenerateDrafts}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generar borradores' }));

    expect(onGenerateDrafts).toHaveBeenCalledTimes(1);
  });
});

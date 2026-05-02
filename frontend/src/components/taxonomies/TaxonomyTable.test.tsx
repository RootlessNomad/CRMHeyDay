/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TaxonomyRow } from './TaxonomyTable';
import { TaxonomyTable } from './TaxonomyTable';

const activeItem: TaxonomyRow = {
  id: 'item_001',
  key: 'cash_flow',
  labelEs: 'Flujo de caja',
  descriptionEs: 'Problemas de tesorería',
  isActive: true,
};

const inactiveItem: TaxonomyRow = {
  id: 'item_002',
  key: 'costes_fijos',
  labelEs: 'Costes fijos',
  descriptionEs: 'Costes operativos elevados',
  isActive: false,
};

describe('TaxonomyTable', () => {
  it('renderiza key, nombre y estado correctamente', () => {
    render(<TaxonomyTable items={[activeItem]} onEdit={vi.fn()} onToggleActive={vi.fn()} />);
    expect(screen.getByText('cash_flow')).toBeInTheDocument();
    expect(screen.getByText('Flujo de caja')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('item inactivo muestra badge "Inactivo" y botón "Activar"', () => {
    render(<TaxonomyTable items={[inactiveItem]} onEdit={vi.fn()} onToggleActive={vi.fn()} />);
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar' })).toBeInTheDocument();
  });

  it('click Editar llama onEdit con el item correcto', () => {
    const onEdit = vi.fn();
    render(<TaxonomyTable items={[activeItem]} onEdit={onEdit} onToggleActive={vi.fn()} />);
    const row = screen.getByText('cash_flow').closest('tr');
    fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledWith(activeItem);
  });

  it('click Desactivar llama onToggleActive con el item correcto', () => {
    const onToggleActive = vi.fn();
    render(<TaxonomyTable items={[activeItem]} onEdit={vi.fn()} onToggleActive={onToggleActive} />);
    const row = screen.getByText('cash_flow').closest('tr');
    fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Desactivar' }));
    expect(onToggleActive).toHaveBeenCalledWith(activeItem);
  });
});

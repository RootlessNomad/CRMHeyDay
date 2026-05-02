'use client';

export interface TaxonomyRow {
  id: string;
  key: string;
  labelEs: string;
  descriptionEs: string;
  isActive: boolean;
}

interface TaxonomyTableProps<T extends TaxonomyRow> {
  items: T[];
  onEdit: (item: T) => void;
  onToggleActive: (item: T) => void;
}

export function TaxonomyTable<T extends TaxonomyRow>({
  items,
  onEdit,
  onToggleActive,
}: TaxonomyTableProps<T>): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-border text-text-muted border-b text-left">
          <tr>
            <th className="px-5 py-3 font-medium">Key</th>
            <th className="px-5 py-3 font-medium">Nombre</th>
            <th className="px-5 py-3 font-medium">Descripción</th>
            <th className="px-5 py-3 font-medium">Estado</th>
            <th className="px-5 py-3 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-border border-b last:border-b-0">
              <td className="px-5 py-4">
                <code className="bg-surface-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  {item.key}
                </code>
              </td>
              <td className="px-5 py-4 font-medium">{item.labelEs}</td>
              <td
                className="text-text-muted max-w-xs truncate px-5 py-4"
                title={item.descriptionEs}
              >
                {item.descriptionEs}
              </td>
              <td className="px-5 py-4">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    item.isActive
                      ? 'bg-green-50 text-green-600'
                      : 'bg-surface-muted text-text-muted'
                  }`}
                >
                  {item.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="px-5 py-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="border-border bg-surface-muted hover:bg-bg h-9 rounded-md border px-3 text-sm font-medium transition"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleActive(item)}
                    className="border-border bg-surface-muted hover:bg-bg h-9 rounded-md border px-3 text-sm font-medium transition"
                  >
                    {item.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

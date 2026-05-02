'use client';

import type { UserDto, UserRole } from '@/lib/api/users';

interface UsersTableProps {
  users: UserDto[];
  currentUserId: string;
  onToggleActive: (user: UserDto) => void;
  onEdit: (user: UserDto) => void;
  onResetPassword: (user: UserDto) => void;
}

const ROLE_STYLES: Record<UserRole, string> = {
  admin: 'text-blue-600 bg-blue-50',
  operator: 'text-green-600 bg-green-50',
  viewer: 'text-text-muted bg-surface-muted',
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  operator: 'Operador',
  viewer: 'Visor',
};

function formatRelativeDate(input: string): string {
  const date = new Date(input);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, 'day');

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return formatter.format(diffMonths, 'month');

  const diffYears = Math.round(diffMonths / 12);
  return formatter.format(diffYears, 'year');
}

export function UsersTable({
  users,
  currentUserId,
  onToggleActive,
  onEdit,
  onResetPassword,
}: UsersTableProps): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-border text-text-muted border-b text-left">
          <tr>
            <th className="px-5 py-3 font-medium">Usuario</th>
            <th className="px-5 py-3 font-medium">Rol</th>
            <th className="px-5 py-3 font-medium">Último acceso</th>
            <th className="px-5 py-3 font-medium">Estado</th>
            <th className="px-5 py-3 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isCurrentUser = user.id === currentUserId;
            const toggleLabel = user.isActive ? 'Desactivar' : 'Activar';

            return (
              <tr key={user.id} className="border-border border-b last:border-b-0">
                <td className="px-5 py-4">
                  <div className="space-y-1">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-text-muted">{user.email}</p>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_STYLES[user.role]}`}
                  >
                    {ROLE_LABELS[user.role]}
                  </span>
                </td>
                <td className="text-text-muted px-5 py-4">
                  {user.lastLoginAt ? formatRelativeDate(user.lastLoginAt) : 'Nunca'}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      user.isActive
                        ? 'bg-green-50 text-green-600'
                        : 'bg-surface-muted text-text-muted'
                    }`}
                  >
                    {user.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(user)}
                      className="border-border bg-surface-muted hover:bg-bg h-9 rounded-md border px-3 text-sm font-medium transition"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onResetPassword(user)}
                      className="border-border bg-surface-muted hover:bg-bg h-9 rounded-md border px-3 text-sm font-medium transition"
                    >
                      Reset pwd
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleActive(user)}
                      disabled={isCurrentUser}
                      title={isCurrentUser ? 'No puedes desactivarte a ti mismo.' : undefined}
                      className="border-border bg-surface-muted hover:bg-bg h-9 rounded-md border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {toggleLabel}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

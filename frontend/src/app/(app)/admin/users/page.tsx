'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { EditUserDialog } from '@/components/users/EditUserDialog';
import { InviteUserDialog } from '@/components/users/InviteUserDialog';
import { ResetPasswordDialog } from '@/components/users/ResetPasswordDialog';
import { UsersTable } from '@/components/users/UsersTable';
import { ApiError } from '@/lib/api/client';
import { listUsers, updateUser, type UserDto } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth/store';

export default function AdminUsersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserDto | null>(null);
  const [resetUser, setResetUser] = useState<UserDto | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
  });

  async function refreshUsers(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  async function handleToggleActive(user: UserDto): Promise<void> {
    try {
      await updateUser(user.id, { isActive: !user.isActive });
      await refreshUsers();
      toast.success(user.isActive ? 'Usuario desactivado.' : 'Usuario activado.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        toast.error(error.message);
        return;
      }

      toast.error('No se pudo actualizar el usuario.');
    }
  }

  const users = usersQuery.data ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestión de usuarios</h1>
          <p className="text-text-muted mt-1 text-sm">
            Invita, edita y administra el acceso del equipo al CRM.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Invitar usuario
          </button>
        </div>
      </div>

      <div className="border-border bg-surface rounded-lg border shadow-sm">
        {usersQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="bg-surface-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : usersQuery.isError ? (
          <div className="p-8 text-center">
            <p className="text-sm">No se pudieron cargar los usuarios.</p>
          </div>
        ) : users.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
            <div>
              <h2 className="text-lg font-semibold">Aún no hay usuarios</h2>
              <p className="text-text-muted mt-1 text-sm">
                Empieza invitando al primer miembro del equipo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="bg-accent h-10 rounded-md px-4 text-sm font-medium text-white transition hover:opacity-90"
            >
              Invitar usuario
            </button>
          </div>
        ) : (
          <UsersTable
            users={users}
            currentUserId={currentUser?.id ?? ''}
            onEdit={setEditUser}
            onResetPassword={setResetUser}
            onToggleActive={(user) => {
              void handleToggleActive(user);
            }}
          />
        )}
      </div>

      <InviteUserDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => {
          setInviteOpen(false);
          toast.success('Usuario invitado.');
          return refreshUsers();
        }}
      />
      <EditUserDialog
        open={editUser !== null}
        user={editUser}
        onClose={() => setEditUser(null)}
        onUpdated={() => {
          setEditUser(null);
          toast.success('Usuario actualizado.');
          return refreshUsers();
        }}
      />
      <ResetPasswordDialog
        open={resetUser !== null}
        user={resetUser}
        onClose={() => setResetUser(null)}
      />
    </div>
  );
}

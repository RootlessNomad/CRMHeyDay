import { apiFetch } from './client';

export type UserRole = 'admin' | 'operator' | 'viewer';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface InviteUserInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

export interface PatchUserInput {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
}

export async function listUsers(): Promise<UserDto[]> {
  return apiFetch<UserDto[]>('/admin/users');
}

export async function getUser(id: string): Promise<UserDto> {
  return apiFetch<UserDto>(`/admin/users/${id}`);
}

export async function inviteUser(input: InviteUserInput): Promise<UserDto> {
  return apiFetch<UserDto>('/admin/users', { method: 'POST', json: input });
}

export async function updateUser(id: string, patch: PatchUserInput): Promise<UserDto> {
  return apiFetch<UserDto>(`/admin/users/${id}`, { method: 'PATCH', json: patch });
}

export async function resetUserPassword(id: string): Promise<{ temporaryPassword: string }> {
  return apiFetch<{ temporaryPassword: string }>(`/admin/users/${id}/password/reset`, {
    method: 'POST',
  });
}

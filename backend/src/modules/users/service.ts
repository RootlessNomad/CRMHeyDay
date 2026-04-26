// Servicio de gestión de usuarios. Framework-agnóstico.
// v1: Alex y Alba son admin; el CRUD se usará desde el admin panel (UJ-11).
// IT-05 aporta `list`, `get`, `update`, `setActive`; `create` ya existe en AuthService.registerAdmin.

import type { PrismaClient, User } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { hashPassword } from '../../core/auth/password.js';
import type { PublicUserDto } from '../auth/service.js';

function toPublic(u: User): PublicUserDto {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
  };
}

export class UsersService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async list(): Promise<PublicUserDto[]> {
    const rows = await this.db.user.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(toPublic);
  }

  async getById(id: string): Promise<PublicUserDto | null> {
    const row = await this.db.user.findUnique({ where: { id } });
    return row ? toPublic(row) : null;
  }

  async getByEmail(email: string): Promise<PublicUserDto | null> {
    const row = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    return row ? toPublic(row) : null;
  }

  async update(
    id: string,
    patch: Partial<Pick<User, 'name' | 'role' | 'isActive'>> & { password?: string },
  ): Promise<PublicUserDto> {
    const data: Partial<User> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.role !== undefined) data.role = patch.role;
    if (patch.isActive !== undefined) data.isActive = patch.isActive;
    if (patch.password) {
      data.passwordHash = await hashPassword(patch.password);
    }
    const updated = await this.db.user.update({ where: { id }, data });
    return toPublic(updated);
  }

  async setActive(id: string, isActive: boolean): Promise<PublicUserDto> {
    return this.update(id, { isActive });
  }
}

export const usersService = new UsersService();

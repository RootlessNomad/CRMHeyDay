// JobsService — consulta del mirror `Job` para la UI.
// No expone `payload` entero por defecto (puede ser grande); la UI lo pide sólo
// cuando el operador lo necesita. Nunca devuelve ciphertext ni otros sensibles
// porque los payloads de queues por contrato sólo contienen ids.

import type { Job, JobQueueStatus, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';

export interface JobPublicDto {
  id: string;
  queue: string;
  status: JobQueueStatus;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface JobWithResultDto extends JobPublicDto {
  result: unknown;
  payload: unknown;
}

function toPublic(j: Job): JobPublicDto {
  return {
    id: j.id,
    queue: j.queue,
    status: j.status,
    error: j.error,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    createdAt: j.createdAt,
  };
}

export class JobNotFoundError extends Error {
  readonly code = 'JOB_NOT_FOUND';
  constructor(id: string) {
    super(`Job '${id}' no encontrado`);
    this.name = 'JobNotFoundError';
  }
}

export class JobsService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async getById(id: string): Promise<JobWithResultDto> {
    const row = await this.db.job.findUnique({ where: { id } });
    if (!row) throw new JobNotFoundError(id);
    return {
      ...toPublic(row),
      result: row.result ?? null,
      payload: row.payload ?? null,
    };
  }

  async listRecent(limit = 50): Promise<JobPublicDto[]> {
    const safe = Math.min(Math.max(limit, 1), 200);
    const rows = await this.db.job.findMany({
      orderBy: { createdAt: 'desc' },
      take: safe,
    });
    return rows.map(toPublic);
  }
}

export const jobsService = new JobsService();

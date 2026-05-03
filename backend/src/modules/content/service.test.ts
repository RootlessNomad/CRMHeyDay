import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentDailyLimitError, ContentService, IdeaNotFoundError } from './service.js';

function buildPrisma() {
  const now = new Date('2026-05-03T10:00:00.000Z');
  const ideas = [
    {
      id: 'idea_1',
      title: 'Idea One',
      angle: 'Angle One',
      pillarId: 'pillar_1',
      serviceLineId: null,
      icpVertical: 'physiotherapy',
      briefEs: 'Brief One',
      status: 'idea',
      createdById: 'user_1',
      createdAt: now,
      updatedAt: now,
      pillar: { id: 'pillar_1', labelEs: 'Educacion' },
      _count: { items: 0 },
    },
    {
      id: 'idea_2',
      title: 'Idea Two',
      angle: 'Angle Two',
      pillarId: 'pillar_2',
      serviceLineId: null,
      icpVertical: 'yoga',
      briefEs: 'Brief Two',
      status: 'shipped',
      createdById: 'user_1',
      createdAt: now,
      updatedAt: now,
      pillar: { id: 'pillar_2', labelEs: 'Ventas' },
      _count: { items: 2 },
    },
  ];
  const items: Array<{
    id: string;
    ideaId: string;
    channel: 'instagram' | 'linkedin' | 'newsletter';
    status: string;
    currentVersionId: string | null;
    createdAt: Date;
  }> = [];
  let auditCount = 0;

  const prisma = {
    contentPillar: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'missing') throw new Error('missing');
        return { id: where.id };
      }),
    },
    auditLog: {
      count: vi.fn(async () => auditCount),
    },
    contentIdea: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `idea_${ideas.length + 1}`,
          title: data['title'],
          angle: data['angle'],
          pillarId: data['pillarId'],
          serviceLineId: data['serviceLineId'] ?? null,
          icpVertical: data['icpVertical'] ?? null,
          briefEs: data['briefEs'],
          status: 'idea',
          createdById: data['createdById'],
          createdAt: now,
          updatedAt: now,
          pillar: { id: data['pillarId'], labelEs: 'Educacion' },
          _count: { items: 0 },
        };
        ideas.push(created as never);
        return created;
      }),
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        ideas.filter((idea) => {
          if (where?.['status'] && idea.status !== where['status']) return false;
          if (where?.['pillarId'] && idea.pillarId !== where['pillarId']) return false;
          return true;
        }),
      ),
      count: vi.fn(
        async ({ where }: { where?: Record<string, unknown> }) =>
          ideas.filter((idea) => {
            if (where?.['status'] && idea.status !== where['status']) return false;
            if (where?.['pillarId'] && idea.pillarId !== where['pillarId']) return false;
            return true;
          }).length,
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          ideas.find((idea) => idea.id === where.id) ?? null,
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const index = ideas.findIndex((idea) => idea.id === where.id);
          if (index === -1) throw new Error('missing');
          const current = ideas[index]!;
          const updated = {
            ...current,
            title: (data['title'] as string | undefined) ?? current.title,
            angle: (data['angle'] as string | undefined) ?? current.angle,
            briefEs: (data['briefEs'] as string | undefined) ?? current.briefEs,
            status: (data['status'] as string | undefined) ?? current.status,
            updatedAt: now,
          };
          ideas[index] = updated;
          return updated;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const index = ideas.findIndex((idea) => idea.id === where.id);
        if (index >= 0) ideas.splice(index, 1);
      }),
    },
    contentItem: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            ideaId: string;
            channel: 'instagram' | 'linkedin' | 'newsletter';
            createdById: string;
          };
        }) => {
          const created = {
            id: `item_${items.length + 1}`,
            ideaId: data.ideaId,
            channel: data.channel,
            status: 'draft',
            currentVersionId: null,
            createdAt: now,
          };
          items.push(created);
          return created;
        },
      ),
    },
  };

  return {
    prisma,
    ideas,
    items,
    setAuditCount(value: number) {
      auditCount = value;
    },
  };
}

describe('ContentService', () => {
  const audit = { record: vi.fn(async () => undefined) };
  const enqueue = vi.fn();
  let service: ContentService;
  let prismaState: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prismaState = buildPrisma();
    enqueue.mockReset();
    enqueue.mockResolvedValue({ jobId: 'job_1' });
    audit.record.mockClear();
    service = new ContentService(
      prismaState.prisma as unknown as PrismaClient,
      audit as never,
      enqueue,
    );
  });

  it('createIdeaManual ok retorna IdeaDto', async () => {
    const result = await service.createIdeaManual(
      {
        title: 'Nueva idea',
        angle: 'Nuevo angulo',
        pillar_id: 'pillar_1',
        brief_es: 'Brief',
      },
      'user_1',
    );

    expect(result).toMatchObject({ title: 'Nueva idea', pillar_id: 'pillar_1' });
  });

  it('createIdeaManual pillar inexistente error', async () => {
    await expect(
      service.createIdeaManual(
        { title: 'Nueva idea', angle: 'Nuevo angulo', pillar_id: 'missing', brief_es: 'Brief' },
        'user_1',
      ),
    ).rejects.toThrow();
  });

  it('requestIdeaGeneration encola y devuelve jobId; audit registrado', async () => {
    const result = await service.requestIdeaGeneration(
      { pillar_id: 'pillar_1', brief_es: 'Brief', count: 5 },
      'user_1',
    );

    expect(result).toEqual({ jobId: 'job_1' });
    expect(enqueue).toHaveBeenCalledWith(
      'content_idea',
      expect.objectContaining({ pillarId: 'pillar_1' }),
    );
    expect(audit.record).toHaveBeenCalled();
  });

  it('requestIdeaGeneration rate-limit >=10 en 24h', async () => {
    prismaState.setAuditCount(10);

    await expect(
      service.requestIdeaGeneration({ pillar_id: 'pillar_1', brief_es: 'Brief' }, 'user_1'),
    ).rejects.toBeInstanceOf(ContentDailyLimitError);
  });

  it('listIdeas sin filtros', async () => {
    const result = await service.listIdeas({ limit: 20, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it('listIdeas con status y pillar_id filtra correctamente', async () => {
    const result = await service.listIdeas({
      status: 'idea',
      pillar_id: 'pillar_1',
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe('idea_1');
  });

  it('getIdeaById ok', async () => {
    const result = await service.getIdeaById('idea_1');
    expect(result.id).toBe('idea_1');
  });

  it('getIdeaById inexistente', async () => {
    await expect(service.getIdeaById('missing')).rejects.toBeInstanceOf(IdeaNotFoundError);
  });

  it('updateIdea ok', async () => {
    const result = await service.updateIdea('idea_1', { title: 'Renamed' }, 'user_1');
    expect(result.title).toBe('Renamed');
  });

  it('deleteIdea ok hard delete', async () => {
    await service.deleteIdea('idea_1', 'user_1');
    await expect(service.getIdeaById('idea_1')).rejects.toBeInstanceOf(IdeaNotFoundError);
  });

  it('requestDraftsForIdea 3 canales', async () => {
    enqueue
      .mockResolvedValueOnce({ jobId: 'job_1' })
      .mockResolvedValueOnce({ jobId: 'job_2' })
      .mockResolvedValueOnce({ jobId: 'job_3' });

    const result = await service.requestDraftsForIdea(
      'idea_1',
      ['instagram', 'linkedin', 'newsletter'],
      'user_1',
    );

    expect(result.items).toHaveLength(3);
    expect(result.jobIds).toEqual(['job_1', 'job_2', 'job_3']);
  });

  it("requestDraftsForIdea channels=['instagram']", async () => {
    const result = await service.requestDraftsForIdea('idea_1', ['instagram'], 'user_1');
    expect(result.items).toHaveLength(1);
    expect(result.jobIds).toEqual(['job_1']);
  });

  it('requestDraftsForIdea idea inexistente', async () => {
    await expect(
      service.requestDraftsForIdea('missing', ['instagram'], 'user_1'),
    ).rejects.toBeInstanceOf(IdeaNotFoundError);
  });
});

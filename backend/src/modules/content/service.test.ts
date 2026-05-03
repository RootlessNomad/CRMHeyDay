import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConflictError,
  ContentDailyLimitError,
  ContentService,
  InvalidTransitionError,
  IdeaNotFoundError,
  ItemNotFoundError,
} from './service.js';

function buildPrisma() {
  const now = new Date('2026-05-03T10:00:00.000Z');
  const scheduledFor = new Date('2026-05-05T00:00:00.000Z');
  type ItemRow = {
    id: string;
    ideaId: string;
    channel: 'instagram' | 'linkedin' | 'newsletter';
    status: string;
    scheduledFor: Date | null;
    currentVersionId: string | null;
    approvedById: string | null;
    approvedAt: Date | null;
    exportedAt: Date | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  };
  type VersionRow = {
    id: string;
    itemId: string;
    versionNumber: number;
    title: string | null;
    body: string;
    hooks: string[];
    ctas: string[];
    hashtags: string[];
    generatedBy: 'claude' | 'human' | 'claude_edited_by_human';
    editedById: string;
    createdAt: Date;
  };
  type ApprovalEventRow = {
    id: string;
    itemId: string;
    fromStatus: string;
    toStatus: string;
    actorId: string;
    comment: string | null;
    createdAt: Date;
  };
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
  const items: ItemRow[] = [
    {
      id: 'item_1',
      ideaId: 'idea_1',
      channel: 'instagram' as const,
      status: 'draft',
      scheduledFor,
      currentVersionId: 'version_3',
      approvedById: null,
      approvedAt: null,
      exportedAt: null,
      createdById: 'user_1',
      createdAt: now,
      updatedAt: now,
      deletedAt: null as Date | null,
    },
    {
      id: 'item_2',
      ideaId: 'idea_2',
      channel: 'linkedin' as const,
      status: 'approved',
      scheduledFor: null,
      currentVersionId: null,
      approvedById: 'user_9',
      approvedAt: new Date('2026-05-02T10:00:00.000Z'),
      exportedAt: null,
      createdById: 'user_2',
      createdAt: now,
      updatedAt: now,
      deletedAt: new Date('2026-05-01T10:00:00.000Z'),
    },
    {
      id: 'item_empty',
      ideaId: 'idea_1',
      channel: 'newsletter' as const,
      status: 'draft',
      scheduledFor: null,
      currentVersionId: null,
      approvedById: null,
      approvedAt: null,
      exportedAt: null,
      createdById: 'user_1',
      createdAt: now,
      updatedAt: now,
      deletedAt: null as Date | null,
    },
    {
      id: 'item_review',
      ideaId: 'idea_2',
      channel: 'linkedin' as const,
      status: 'in_review',
      scheduledFor: null,
      currentVersionId: null,
      approvedById: null,
      approvedAt: null,
      exportedAt: null,
      createdById: 'user_2',
      createdAt: new Date('2026-05-01T09:00:00.000Z'),
      updatedAt: new Date('2026-05-01T09:00:00.000Z'),
      deletedAt: null as Date | null,
    },
  ];
  const versions: VersionRow[] = [
    {
      id: 'version_1',
      itemId: 'item_1',
      versionNumber: 1,
      title: 'Title 1',
      body: 'Body 1',
      hooks: ['Hook 1'],
      ctas: ['CTA 1'],
      hashtags: ['#one'],
      generatedBy: 'claude' as const,
      editedById: 'user_1',
      createdAt: new Date('2026-05-01T10:00:00.000Z'),
    },
    {
      id: 'version_2',
      itemId: 'item_1',
      versionNumber: 2,
      title: 'Title 2',
      body: 'Body 2',
      hooks: ['Hook 2'],
      ctas: ['CTA 2'],
      hashtags: ['#two'],
      generatedBy: 'human' as const,
      editedById: 'user_1',
      createdAt: new Date('2026-05-02T10:00:00.000Z'),
    },
    {
      id: 'version_3',
      itemId: 'item_1',
      versionNumber: 3,
      title: 'Title 3',
      body: 'Body 3',
      hooks: ['Hook 3'],
      ctas: ['CTA 3'],
      hashtags: ['#three'],
      generatedBy: 'claude_edited_by_human' as const,
      editedById: 'user_2',
      createdAt: new Date('2026-05-03T10:00:00.000Z'),
    },
  ];
  const approvalEvents: ApprovalEventRow[] = [
    {
      id: 'approval_1',
      itemId: 'item_review',
      fromStatus: 'draft',
      toStatus: 'in_review',
      actorId: 'user_2',
      comment: 'Listo para revisar',
      createdAt: new Date('2026-05-01T09:30:00.000Z'),
    },
  ];
  let auditCount = 0;
  let versionCountSequence: number[] = [];

  const getVersionCount = (itemId: string) => {
    const next = versionCountSequence.shift();
    if (next !== undefined) return next;
    return versions.filter((version) => version.itemId === itemId).length;
  };

  const buildItemDetail = (item: ItemRow) => {
    const itemVersions = versions
      .filter((version) => version.itemId === item.id)
      .sort((left, right) => right.versionNumber - left.versionNumber)
      .slice(0, 5);

    return {
      ...item,
      currentVersion:
        item.currentVersionId === null
          ? null
          : (versions.find((version) => version.id === item.currentVersionId) ?? null),
      versions: itemVersions,
    };
  };

  const buildItemWithApprovals = (item: ItemRow) => ({
    ...buildItemDetail(item),
    approvalEvents: approvalEvents
      .filter((event) => event.itemId === item.id)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
  });

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
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `item_${items.length + 1}`,
          ideaId: data['ideaId'] as string,
          channel: data['channel'] as 'instagram' | 'linkedin' | 'newsletter',
          status: data['status'] as string,
          scheduledFor: null,
          currentVersionId: null,
          approvedById: null,
          approvedAt: null,
          exportedAt: null,
          createdById: data['createdById'] as string,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        items.push(created);
        return created;
      }),
      findFirst: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { id: string; deletedAt: null };
          include?: Record<string, unknown>;
        }) => {
          const item = items.find((candidate) => {
            if (candidate.id !== where.id) return false;
            if (where.deletedAt === null && candidate.deletedAt !== null) return false;
            return true;
          });
          if (!item) return null;
          if (!include) return item;
          if ('approvalEvents' in include) return buildItemWithApprovals(item);
          return buildItemDetail(item);
        },
      ),
      findFirstOrThrow: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { id: string; deletedAt: null };
          include?: Record<string, unknown>;
        }) => {
          const found = await prisma.contentItem.findFirst({ where, include });
          if (!found) throw new Error('missing');
          return found;
        },
      ),
      findMany: vi.fn(
        async ({
          where,
          take,
          skip,
        }: {
          where?: { status?: string; deletedAt?: null };
          take?: number;
          skip?: number;
        }) =>
          items
            .filter((item) => {
              if (where?.status && item.status !== where.status) return false;
              if (where?.deletedAt === null && item.deletedAt !== null) return false;
              return true;
            })
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
            .slice(skip ?? 0, (skip ?? 0) + (take ?? items.length))
            .map(buildItemWithApprovals),
      ),
      count: vi.fn(
        async ({ where }: { where?: { status?: string; deletedAt?: null } }) =>
          items.filter((item) => {
            if (where?.status && item.status !== where.status) return false;
            if (where?.deletedAt === null && item.deletedAt !== null) return false;
            return true;
          }).length,
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const item = items.find((candidate) => candidate.id === where.id);
          if (!item) throw new Error('missing');
          if ('currentVersionId' in data)
            item.currentVersionId = data['currentVersionId'] as string;
          if ('status' in data) item.status = data['status'] as string;
          if ('approvedById' in data)
            item.approvedById = (data['approvedById'] as string | null) ?? null;
          if ('approvedAt' in data) item.approvedAt = (data['approvedAt'] as Date | null) ?? null;
          if ('exportedAt' in data) item.exportedAt = (data['exportedAt'] as Date | null) ?? null;
          item.updatedAt = now;
          return item;
        },
      ),
    },
    contentApprovalEvent: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            itemId: string;
            fromStatus: string;
            toStatus: string;
            actorId: string;
            comment: string | null;
          };
        }) => {
          const created = {
            id: `approval_${approvalEvents.length + 1}`,
            itemId: data.itemId,
            fromStatus: data.fromStatus,
            toStatus: data.toStatus,
            actorId: data.actorId,
            comment: data.comment,
            createdAt: new Date(now.getTime() + approvalEvents.length * 1000),
          };
          approvalEvents.push(created);
          return created;
        },
      ),
    },
    contentVersion: {
      count: vi.fn(async ({ where }: { where: { itemId: string } }) =>
        getVersionCount(where.itemId),
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            itemId: string;
            versionNumber: number;
            title: string | null;
            body: string;
            hooks: string[];
            ctas: string[];
            hashtags: string[];
            generatedBy: 'human';
            editedById: string;
          };
        }) => {
          const created = {
            id: `version_${versions.length + 1}`,
            itemId: data.itemId,
            versionNumber: data.versionNumber,
            title: data.title,
            body: data.body,
            hooks: data.hooks,
            ctas: data.ctas,
            hashtags: data.hashtags,
            generatedBy: data.generatedBy,
            editedById: data.editedById,
            createdAt: now,
          };
          versions.push(created);
          return created;
        },
      ),
    },
    $transaction: vi.fn(
      async (
        callback: (tx: {
          contentApprovalEvent: typeof prisma.contentApprovalEvent;
          contentVersion: typeof prisma.contentVersion;
          contentItem: typeof prisma.contentItem;
        }) => Promise<unknown>,
      ) =>
        callback({
          contentApprovalEvent: prisma.contentApprovalEvent,
          contentVersion: prisma.contentVersion,
          contentItem: prisma.contentItem,
        }),
    ),
  };

  return {
    prisma,
    items,
    approvalEvents,
    versions,
    setAuditCount(value: number) {
      auditCount = value;
    },
    setVersionCountSequence(values: number[]) {
      versionCountSequence = [...values];
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

  it('getItemById happy path devuelve currentVersion y versiones desc', async () => {
    const result = await service.getItemById('item_1');

    expect(result).toMatchObject({
      id: 'item_1',
      idea_id: 'idea_1',
      current_version_id: 'version_3',
      scheduled_for: '2026-05-05',
      current_version: { id: 'version_3', version_number: 3 },
    });
    expect(result.versions.map((version) => version.version_number)).toEqual([3, 2, 1]);
  });

  it('getItemById 404 -> ItemNotFoundError', async () => {
    await expect(service.getItemById('missing')).rejects.toBeInstanceOf(ItemNotFoundError);
  });

  it('getItemById ignora soft-deleted', async () => {
    await expect(service.getItemById('item_2')).rejects.toBeInstanceOf(ItemNotFoundError);
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

  it("submitForReview happy path -> status='in_review' y evento creado", async () => {
    const result = await service.submitForReview('item_1', 'user_reviewer', 'Enviar');

    expect(result.status).toBe('in_review');
    expect(result.approval_events[0]).toMatchObject({
      item_id: 'item_1',
      from_status: 'draft',
      to_status: 'in_review',
      actor_id: 'user_reviewer',
      comment: 'Enviar',
    });
    expect(prismaState.approvalEvents.some((event) => event.itemId === 'item_1')).toBe(true);
  });

  it('submitForReview desde status no-draft -> InvalidTransitionError', async () => {
    await expect(service.submitForReview('item_review', 'user_reviewer')).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });

  it('approveItem happy path -> status=approved, approvedById fijado', async () => {
    const result = await service.approveItem('item_review', 'approver_1', 'OK');

    const updatedItem = prismaState.items.find((item) => item.id === 'item_review');
    expect(result.status).toBe('approved');
    expect(updatedItem?.approvedById).toBe('approver_1');
    expect(updatedItem?.approvedAt).toBeInstanceOf(Date);
    expect(result.approval_events[0]).toMatchObject({
      from_status: 'in_review',
      to_status: 'approved',
      actor_id: 'approver_1',
    });
  });

  it('approveItem desde status no-in_review -> InvalidTransitionError', async () => {
    await expect(service.approveItem('item_1', 'approver_1')).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });

  it("rejectItem -> vuelve a 'draft'", async () => {
    const result = await service.rejectItem('item_review', 'approver_1', 'Faltan cambios');

    expect(result.status).toBe('draft');
    expect(result.approval_events[0]).toMatchObject({
      from_status: 'in_review',
      to_status: 'draft',
      comment: 'Faltan cambios',
    });
  });

  it('listPendingReviews -> solo devuelve items in_review', async () => {
    const result = await service.listPendingReviews({ limit: 20, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('item_review');
    expect(result.items[0]?.status).toBe('in_review');
    expect(result.items[0]?.approval_events[0]?.id).toBe('approval_1');
  });

  it('submitForReview item no existe -> ItemNotFoundError', async () => {
    await expect(service.submitForReview('missing', 'user_1')).rejects.toBeInstanceOf(
      ItemNotFoundError,
    );
  });

  it('approveItem item no existe -> ItemNotFoundError', async () => {
    await expect(service.approveItem('missing', 'user_1')).rejects.toBeInstanceOf(
      ItemNotFoundError,
    );
  });

  it('rejectItem item no existe -> ItemNotFoundError', async () => {
    await expect(service.rejectItem('missing', 'user_1')).rejects.toBeInstanceOf(ItemNotFoundError);
  });

  it('audit.record se llama en submitForReview', async () => {
    await service.submitForReview('item_1', 'user_reviewer');

    expect(audit.record).toHaveBeenCalledWith({
      actorUserId: 'user_reviewer',
      action: 'content.approval.submitted',
      entityType: 'ContentItem',
      entityId: 'item_1',
      metadata: { fromStatus: 'draft', toStatus: 'in_review' },
    });
  });

  it('createVersion happy path crea v1, actualiza currentVersionId y audit', async () => {
    const result = await service.createVersion(
      'item_empty',
      {
        body: 'Nuevo body',
        title: 'Nuevo titulo',
        hooks: ['Hook'],
        ctas: ['CTA'],
        hashtags: ['#heyday'],
      },
      'user_9',
    );

    const updatedItem = prismaState.items.find((item) => item.id === 'item_empty');
    expect(result).toMatchObject({
      item_id: 'item_empty',
      version_number: 1,
      generated_by: 'human',
      edited_by_id: 'user_9',
    });
    expect(updatedItem?.currentVersionId).toBe('version_4');
    expect(audit.record).toHaveBeenCalledWith({
      actorUserId: 'user_9',
      action: 'content.version.created',
      entityType: 'content_version',
      entityId: 'version_4',
      metadata: { itemId: 'item_empty', versionNumber: 1 },
    });
  });

  it('createVersion en item sin versiones previas -> versionNumber=1', async () => {
    const result = await service.createVersion(
      'item_empty',
      { body: 'Solo body', hooks: [], ctas: [], hashtags: [] },
      'user_1',
    );

    expect(result.version_number).toBe(1);
  });

  it('createVersion incrementa versionNumber cuando ya existen versiones', async () => {
    const result = await service.createVersion(
      'item_1',
      { body: 'Body 4', hooks: [], ctas: [], hashtags: [] },
      'user_1',
    );

    expect(result.version_number).toBe(4);
  });

  it('createVersion conflict (recount difiere de count) -> ConflictError', async () => {
    prismaState.setVersionCountSequence([3, 4]);

    await expect(
      service.createVersion(
        'item_1',
        { body: 'Body 4', hooks: [], ctas: [], hashtags: [] },
        'user_1',
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('createVersion item no existe -> ItemNotFoundError', async () => {
    await expect(
      service.createVersion(
        'missing',
        { body: 'Body', hooks: [], ctas: [], hashtags: [] },
        'user_1',
      ),
    ).rejects.toBeInstanceOf(ItemNotFoundError);
  });
});

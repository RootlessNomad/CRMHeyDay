import type { PrismaClient } from '@prisma/client';

import { enqueue as defaultEnqueue, QUEUE_NAMES } from '../../core/queue/queues.js';
import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import type { PayloadForQueue, QueueName } from '../../core/queue/types.js';
import { auditService, type AuditService } from '../audit/index.js';
import type {
  DraftRequestInput,
  IdeaCreateManualInput,
  IdeaDto,
  IdeaListQuery,
  IdeaUpdateInput,
  ItemSummaryDto,
} from './schemas.js';
import { toIdeaDto } from './schemas.js';

interface EnqueueLike {
  <N extends QueueName>(name: N, payload: PayloadForQueue[N]): Promise<{ jobId: string }>;
}

export class IdeaNotFoundError extends Error {
  constructor(id: string) {
    super(`Idea ${id} not found`);
    this.name = 'IdeaNotFoundError';
  }
}

export class ContentDailyLimitError extends Error {
  constructor() {
    super('Daily content generation limit reached');
    this.name = 'ContentDailyLimitError';
  }
}

function toItemSummaryDto(row: {
  id: string;
  ideaId: string;
  channel: 'instagram' | 'linkedin' | 'newsletter';
  status: string;
  currentVersionId: string | null;
  createdAt: Date;
}): ItemSummaryDto {
  return {
    id: row.id,
    idea_id: row.ideaId,
    channel: row.channel,
    status: row.status,
    current_version_id: row.currentVersionId,
    created_at: row.createdAt.toISOString(),
  };
}

export class ContentService {
  private readonly db: PrismaClient;
  private readonly audit: AuditService;
  private readonly enqueue: EnqueueLike;

  constructor(
    prisma: PrismaClient = defaultPrisma,
    audit: AuditService = auditService,
    enqueue: EnqueueLike = defaultEnqueue as EnqueueLike,
  ) {
    this.db = prisma;
    this.audit = audit;
    this.enqueue = enqueue;
  }

  async createIdeaManual(input: IdeaCreateManualInput, actorUserId: string): Promise<IdeaDto> {
    await this.db.contentPillar.findUniqueOrThrow({ where: { id: input.pillar_id } });
    const created = await this.db.contentIdea.create({
      data: {
        title: input.title,
        angle: input.angle,
        pillarId: input.pillar_id,
        serviceLineId: input.service_line_id,
        icpVertical: input.icp_vertical,
        briefEs: input.brief_es,
        createdById: actorUserId,
      },
      include: {
        pillar: { select: { id: true, labelEs: true } },
        _count: { select: { items: true } },
      },
    });

    await this.audit.record({
      actorUserId,
      action: 'content_idea.created',
      entityType: 'content_idea',
      entityId: created.id,
      metadata: { pillarId: input.pillar_id },
    });

    return toIdeaDto(created);
  }

  async requestIdeaGeneration(
    input: {
      pillar_id: string;
      service_line_id?: string;
      icp_vertical?: string;
      brief_es: string;
      count?: number;
    },
    actorUserId: string,
  ): Promise<{ jobId: string }> {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const recent = await this.db.auditLog.count({
      where: {
        action: 'content_idea.generation_requested',
        actorUserId,
        createdAt: { gt: since },
      },
    });
    if (recent >= 10) throw new ContentDailyLimitError();

    await this.audit.record({
      actorUserId,
      action: 'content_idea.generation_requested',
      entityType: 'content_pillar',
      entityId: input.pillar_id,
      metadata: { pillarId: input.pillar_id, count: input.count ?? 5 },
    });

    return this.enqueue(QUEUE_NAMES.contentIdea, {
      pillarId: input.pillar_id,
      serviceLineId: input.service_line_id,
      icpVertical: input.icp_vertical as never,
      briefEs: input.brief_es,
      actorUserId,
      count: Math.min(10, Math.max(3, input.count ?? 5)),
    });
  }

  async listIdeas(
    query: IdeaListQuery,
  ): Promise<{ items: IdeaDto[]; total: number; limit: number; offset: number }> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.pillar_id ? { pillarId: query.pillar_id } : {}),
      ...(query.vertical ? { icpVertical: query.vertical } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' as const } },
              { angle: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.db.contentIdea.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        include: {
          pillar: { select: { id: true, labelEs: true } },
          _count: { select: { items: true } },
        },
      }),
      this.db.contentIdea.count({ where }),
    ]);

    return {
      items: items.map(toIdeaDto),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getIdeaById(id: string): Promise<IdeaDto> {
    const row = await this.db.contentIdea.findUnique({
      where: { id },
      include: {
        pillar: { select: { id: true, labelEs: true } },
        _count: { select: { items: true } },
      },
    });
    if (!row) throw new IdeaNotFoundError(id);
    return toIdeaDto(row);
  }

  async updateIdea(id: string, input: IdeaUpdateInput, actorUserId: string): Promise<IdeaDto> {
    const existing = await this.db.contentIdea.findUnique({ where: { id } });
    if (!existing) throw new IdeaNotFoundError(id);

    const updated = await this.db.contentIdea.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.angle !== undefined ? { angle: input.angle } : {}),
        ...(input.brief_es !== undefined ? { briefEs: input.brief_es } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: {
        pillar: { select: { id: true, labelEs: true } },
        _count: { select: { items: true } },
      },
    });

    await this.audit.record({
      actorUserId,
      action: 'content_idea.updated',
      entityType: 'content_idea',
      entityId: id,
      metadata: { changedFields: Object.keys(input) },
    });

    return toIdeaDto(updated);
  }

  async deleteIdea(id: string, actorUserId: string): Promise<void> {
    const existing = await this.db.contentIdea.findUnique({ where: { id } });
    if (!existing) throw new IdeaNotFoundError(id);
    await this.db.contentIdea.delete({ where: { id } });
    await this.audit.record({
      actorUserId,
      action: 'content_idea.deleted',
      entityType: 'content_idea',
      entityId: id,
      metadata: {},
    });
  }

  async requestDraftsForIdea(
    ideaId: string,
    channels: DraftRequestInput['channels'],
    actorUserId: string,
  ): Promise<{ items: ItemSummaryDto[]; jobIds: string[] }> {
    const idea = await this.db.contentIdea.findUnique({ where: { id: ideaId } });
    if (!idea) throw new IdeaNotFoundError(ideaId);

    const items: ItemSummaryDto[] = [];
    const jobIds: string[] = [];

    for (const channel of channels) {
      const item = await this.db.contentItem.create({
        data: {
          ideaId,
          channel,
          status: 'draft',
          createdById: actorUserId,
        },
      });
      const job = await this.enqueue(QUEUE_NAMES.contentGeneration, {
        contentItemId: item.id,
        actorUserId,
      });
      items.push(toItemSummaryDto(item));
      jobIds.push(job.jobId);
    }

    await this.audit.record({
      actorUserId,
      action: 'content_item.drafts_requested',
      entityType: 'content_idea',
      entityId: ideaId,
      metadata: {
        ideaId,
        channels,
        itemIds: items.map((item) => item.id),
        jobIds,
      },
    });

    return { items, jobIds };
  }
}

export const contentService = new ContentService();

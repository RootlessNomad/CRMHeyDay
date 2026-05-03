import type { ContentItem, PrismaClient } from '@prisma/client';

import { enqueue as defaultEnqueue, QUEUE_NAMES } from '../../core/queue/queues.js';
import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import type { PayloadForQueue, QueueName } from '../../core/queue/types.js';
import { auditService, type AuditService } from '../audit/index.js';
import type {
  CalendarItemDto,
  CalendarQuery,
  ContentItemWithApprovalsDto,
  ContentItemDetailDto,
  ContentVersionDto,
  CreateVersionBody,
  DraftRequestInput,
  ExportFormat,
  IdeaCreateManualInput,
  IdeaDto,
  IdeaListQuery,
  IdeaUpdateInput,
  ItemSummaryDto,
  LibraryQuery,
} from './schemas.js';
import { toApprovalEventDto, toIdeaDto, toVersionDto } from './schemas.js';

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

export class ItemNotFoundError extends Error {
  constructor(id: string) {
    super(`ContentItem ${id} not found`);
    this.name = 'ItemNotFoundError';
  }
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

function toItemSummaryDto(row: {
  id: string;
  ideaId: string;
  channel: 'instagram' | 'linkedin' | 'newsletter';
  status: string;
  currentVersionId: string | null;
  createdAt: Date;
  idea: { title: string; pillar: { labelEs: string } };
}): ItemSummaryDto {
  return {
    id: row.id,
    idea_id: row.ideaId,
    channel: row.channel,
    status: row.status,
    current_version_id: row.currentVersionId,
    created_at: row.createdAt.toISOString(),
    idea_title: row.idea.title,
    pillar_label: row.idea.pillar.labelEs,
  };
}

function toCalendarItemDto(row: {
  id: string;
  channel: 'instagram' | 'linkedin' | 'newsletter';
  status: 'draft' | 'in_review' | 'approved' | 'exported' | 'archived';
  scheduledFor: Date | null;
  currentVersion: { id: string } | null;
  idea: { title: string; pillar: { labelEs: string } };
}): CalendarItemDto {
  return {
    id: row.id,
    channel: row.channel,
    status: row.status,
    scheduled_for: row.scheduledFor ? row.scheduledFor.toISOString().slice(0, 10) : null,
    idea_title: row.idea.title,
    pillar_label: row.idea.pillar.labelEs,
    current_version_id: row.currentVersion?.id ?? null,
  };
}

function sanitizeCsvCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function buildMarkdown(item: ContentItemDetailDto): string {
  const v = item.current_version;
  const lines = [
    '---',
    `canal: ${item.channel}`,
    `pilar: ${item.idea.pillar_label}`,
    `estado: ${item.status}`,
    item.scheduled_for ? `scheduled_for: ${item.scheduled_for}` : null,
    v?.hashtags?.length ? `hashtags: [${v.hashtags.map((h) => `"${h}"`).join(', ')}]` : null,
    '---',
    '',
    v?.title ? `# ${v.title}` : `# ${item.idea.title}`,
    '',
    v?.body ?? '',
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}

function buildPlain(item: ContentItemDetailDto): string {
  const v = item.current_version;
  const parts = [v?.title ?? item.idea.title, '', v?.body ?? ''];
  if (v?.hashtags?.length) parts.push('', v.hashtags.map((h) => `#${h}`).join(' '));
  return parts.join('\n');
}

function buildIcs(item: ContentItemDetailDto): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const dateVal = item.scheduled_for ? item.scheduled_for.replace(/-/g, '') : now.slice(0, 8);
  const title = (item.current_version?.title ?? item.idea.title).replace(/[\\;,]/g, '\\$&');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HeyDay CRM//Content//ES',
    'BEGIN:VEVENT',
    `UID:${item.id}@heyday`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${dateVal}`,
    `DTEND;VALUE=DATE:${dateVal}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:Canal: ${item.channel}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function buildCsv(item: ContentItemDetailDto): string {
  const headers = [
    'id',
    'canal',
    'estado',
    'titulo',
    'pillar',
    'scheduled_for',
    'hashtags',
    'cuerpo',
  ];
  const v = item.current_version;
  const row = [
    item.id,
    item.channel,
    item.status,
    v?.title ?? item.idea.title,
    item.idea.pillar_label,
    item.scheduled_for ?? '',
    v?.hashtags?.join(' ') ?? '',
    v?.body ?? '',
  ].map(sanitizeCsvCell);
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [headers.map(escape).join(','), row.map(escape).join(',')].join('\n');
}

const itemDetailInclude = {
  currentVersion: true,
  versions: {
    orderBy: { versionNumber: 'desc' as const },
    take: 5,
  },
  idea: {
    include: {
      pillar: {
        select: { labelEs: true },
      },
    },
  },
};

const itemWithApprovalsInclude = {
  ...itemDetailInclude,
  approvalEvents: {
    orderBy: { createdAt: 'desc' as const },
  },
};

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

  private toDetailDto(row: {
    id: string;
    ideaId: string;
    channel: 'instagram' | 'linkedin' | 'newsletter';
    status: 'draft' | 'in_review' | 'approved' | 'exported' | 'archived';
    scheduledFor: Date | null;
    currentVersionId: string | null;
    currentVersion: Parameters<typeof toVersionDto>[0] | null;
    versions: Parameters<typeof toVersionDto>[0][];
    idea: { title: string; pillar: { labelEs: string } };
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }): ContentItemDetailDto {
    return {
      id: row.id,
      idea_id: row.ideaId,
      channel: row.channel,
      status: row.status,
      scheduled_for: row.scheduledFor?.toISOString().slice(0, 10) ?? null,
      current_version_id: row.currentVersionId,
      current_version: row.currentVersion ? toVersionDto(row.currentVersion) : null,
      versions: row.versions.map(toVersionDto),
      idea: {
        title: row.idea.title,
        pillar_label: row.idea.pillar.labelEs,
      },
      created_by_id: row.createdById,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private toItemWithApprovalsDto(row: {
    approvalEvents?: Parameters<typeof toApprovalEventDto>[0][];
    id: string;
    ideaId: string;
    channel: 'instagram' | 'linkedin' | 'newsletter';
    status: 'draft' | 'in_review' | 'approved' | 'exported' | 'archived';
    scheduledFor: Date | null;
    currentVersionId: string | null;
    currentVersion: Parameters<typeof toVersionDto>[0] | null;
    versions: Parameters<typeof toVersionDto>[0][];
    idea: { title: string; pillar: { labelEs: string } };
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }): ContentItemWithApprovalsDto {
    const base = this.toDetailDto(row);
    return {
      ...base,
      approval_events: (row.approvalEvents ?? []).map(toApprovalEventDto),
    };
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

  async getItemById(id: string): Promise<ContentItemDetailDto> {
    const row = await this.db.contentItem.findFirst({
      where: { id, deletedAt: null },
      include: itemDetailInclude,
    });
    if (!row) throw new ItemNotFoundError(id);
    return this.toDetailDto(row);
  }

  async exportItem(
    itemId: string,
    format: ExportFormat,
    actorUserId: string,
  ): Promise<{ content: string; filename: string; contentType: string }> {
    const item = await this.getItemById(itemId);
    if (!['approved', 'exported'].includes(item.status)) {
      throw new InvalidTransitionError(item.status, 'export');
    }

    if (item.status === 'approved') {
      await this.db.contentItem.update({
        where: { id: itemId },
        data: { status: 'exported' },
      });
    }

    await this.audit.record({
      actorUserId,
      action: 'content.item.exported',
      entityType: 'ContentItem',
      entityId: itemId,
      metadata: { itemId, format },
    });

    const slug = item.idea.title.toLowerCase().replace(/\s+/g, '-').slice(0, 40);

    switch (format) {
      case 'md':
        return {
          content: buildMarkdown(item),
          filename: `${slug}.md`,
          contentType: 'text/markdown',
        };
      case 'plain':
        return { content: buildPlain(item), filename: `${slug}.txt`, contentType: 'text/plain' };
      case 'ics':
        return { content: buildIcs(item), filename: `${slug}.ics`, contentType: 'text/calendar' };
      case 'csv':
        return { content: buildCsv(item), filename: `${slug}.csv`, contentType: 'text/csv' };
    }
  }

  async listLibrary(query: LibraryQuery): Promise<{ total: number; items: ItemSummaryDto[] }> {
    const where = {
      deletedAt: null,
      status: query.status
        ? { equals: query.status as ContentItem['status'] }
        : { not: 'archived' as const },
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.pillar_id ? { idea: { pillarId: query.pillar_id } } : {}),
      ...(query.q
        ? {
            OR: [
              { idea: { title: { contains: query.q, mode: 'insensitive' as const } } },
              { currentVersion: { body: { contains: query.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.db.contentItem.count({ where }),
      this.db.contentItem.findMany({
        where,
        include: {
          idea: {
            include: { pillar: { select: { labelEs: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
    ]);

    return { total, items: rows.map(toItemSummaryDto) };
  }

  async listCalendarItems(query: CalendarQuery): Promise<CalendarItemDto[]> {
    const items = await this.db.contentItem.findMany({
      where: {
        deletedAt: null,
        scheduledFor: {
          gte: new Date(query.from),
          lte: new Date(query.to),
        },
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.icp_vertical ? { idea: { icpVertical: query.icp_vertical } } : {}),
      },
      include: {
        idea: {
          include: {
            pillar: {
              select: { labelEs: true },
            },
          },
        },
        currentVersion: {
          select: { id: true },
        },
      },
      orderBy: { scheduledFor: 'asc' },
    });

    return items.map(toCalendarItemDto);
  }

  async rescheduleItem(
    itemId: string,
    scheduledFor: string | null,
    actorUserId: string,
  ): Promise<CalendarItemDto> {
    const existing = await this.db.contentItem.findFirst({
      where: { id: itemId, deletedAt: null },
    });
    if (!existing) throw new ItemNotFoundError(itemId);

    await this.db.contentItem.update({
      where: { id: itemId },
      data: {
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      },
    });

    await this.audit.record({
      actorUserId,
      action: 'content.item.rescheduled',
      entityType: 'ContentItem',
      entityId: itemId,
      metadata: { itemId, scheduledFor },
    });

    const updated = await this.db.contentItem.findFirst({
      where: { id: itemId, deletedAt: null },
      include: {
        idea: {
          include: {
            pillar: {
              select: { labelEs: true },
            },
          },
        },
        currentVersion: {
          select: { id: true },
        },
      },
    });
    if (!updated) throw new ItemNotFoundError(itemId);

    return toCalendarItemDto(updated);
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
    const idea = await this.db.contentIdea.findUnique({
      where: { id: ideaId },
      include: { pillar: { select: { labelEs: true } } },
    });
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
      items.push(toItemSummaryDto({ ...item, idea: { title: idea.title, pillar: idea.pillar } }));
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

  async createVersion(
    itemId: string,
    body: CreateVersionBody,
    actorUserId: string,
  ): Promise<ContentVersionDto> {
    const item = await this.db.contentItem.findFirst({
      where: { id: itemId, deletedAt: null },
    });
    if (!item) throw new ItemNotFoundError(itemId);

    const count = await this.db.contentVersion.count({ where: { itemId } });
    const newVersion = await this.db.$transaction(async (tx) => {
      const recount = await tx.contentVersion.count({ where: { itemId } });
      if (recount !== count) {
        throw new ConflictError('Version conflict: please refresh');
      }

      const created = await tx.contentVersion.create({
        data: {
          itemId,
          versionNumber: count + 1,
          body: body.body,
          title: body.title ?? null,
          hooks: body.hooks,
          ctas: body.ctas,
          hashtags: body.hashtags,
          generatedBy: 'human',
          editedById: actorUserId,
        },
      });

      await tx.contentItem.update({
        where: { id: itemId },
        data: { currentVersionId: created.id },
      });

      return created;
    });

    await this.audit.record({
      actorUserId,
      action: 'content.version.created',
      entityType: 'content_version',
      entityId: newVersion.id,
      metadata: { itemId, versionNumber: count + 1 },
    });

    return toVersionDto(newVersion);
  }

  async submitForReview(
    itemId: string,
    actorUserId: string,
    comment?: string,
  ): Promise<ContentItemWithApprovalsDto> {
    const item = await this.db.contentItem.findFirst({ where: { id: itemId, deletedAt: null } });
    if (!item) throw new ItemNotFoundError(itemId);
    if (item.status !== 'draft') throw new InvalidTransitionError(item.status, 'in_review');

    const updated = await this.db.$transaction(async (tx) => {
      await tx.contentApprovalEvent.create({
        data: {
          itemId,
          fromStatus: 'draft',
          toStatus: 'in_review',
          actorId: actorUserId,
          comment: comment ?? null,
        },
      });

      await tx.contentItem.update({
        where: { id: itemId },
        data: { status: 'in_review' },
      });

      return tx.contentItem.findFirstOrThrow({
        where: { id: itemId, deletedAt: null },
        include: itemWithApprovalsInclude,
      });
    });

    await this.audit.record({
      actorUserId,
      action: 'content.approval.submitted',
      entityType: 'ContentItem',
      entityId: itemId,
      metadata: { fromStatus: 'draft', toStatus: 'in_review' },
    });

    return this.toItemWithApprovalsDto(updated);
  }

  async approveItem(
    itemId: string,
    actorUserId: string,
    comment?: string,
  ): Promise<ContentItemWithApprovalsDto> {
    const item = await this.db.contentItem.findFirst({ where: { id: itemId, deletedAt: null } });
    if (!item) throw new ItemNotFoundError(itemId);
    if (item.status !== 'in_review') throw new InvalidTransitionError(item.status, 'approved');

    const approvedAt = new Date();
    const updated = await this.db.$transaction(async (tx) => {
      await tx.contentApprovalEvent.create({
        data: {
          itemId,
          fromStatus: 'in_review',
          toStatus: 'approved',
          actorId: actorUserId,
          comment: comment ?? null,
        },
      });

      await tx.contentItem.update({
        where: { id: itemId },
        data: { status: 'approved', approvedById: actorUserId, approvedAt },
      });

      return tx.contentItem.findFirstOrThrow({
        where: { id: itemId, deletedAt: null },
        include: itemWithApprovalsInclude,
      });
    });

    await this.audit.record({
      actorUserId,
      action: 'content.approval.approved',
      entityType: 'ContentItem',
      entityId: itemId,
      metadata: { itemId },
    });

    return this.toItemWithApprovalsDto(updated);
  }

  async rejectItem(
    itemId: string,
    actorUserId: string,
    comment?: string,
  ): Promise<ContentItemWithApprovalsDto> {
    const item = await this.db.contentItem.findFirst({ where: { id: itemId, deletedAt: null } });
    if (!item) throw new ItemNotFoundError(itemId);
    if (item.status !== 'in_review') throw new InvalidTransitionError(item.status, 'draft');

    const updated = await this.db.$transaction(async (tx) => {
      await tx.contentApprovalEvent.create({
        data: {
          itemId,
          fromStatus: 'in_review',
          toStatus: 'draft',
          actorId: actorUserId,
          comment: comment ?? null,
        },
      });

      await tx.contentItem.update({
        where: { id: itemId },
        data: { status: 'draft', approvedById: null, approvedAt: null },
      });

      return tx.contentItem.findFirstOrThrow({
        where: { id: itemId, deletedAt: null },
        include: itemWithApprovalsInclude,
      });
    });

    await this.audit.record({
      actorUserId,
      action: 'content.approval.rejected',
      entityType: 'ContentItem',
      entityId: itemId,
      metadata: { itemId },
    });

    return this.toItemWithApprovalsDto(updated);
  }

  async listPendingReviews(query: { limit: number; offset: number }): Promise<{
    items: ContentItemWithApprovalsDto[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const where = { status: 'in_review' as const, deletedAt: null };
    const [rows, total] = await Promise.all([
      this.db.contentItem.findMany({
        where,
        include: {
          currentVersion: true,
          versions: { orderBy: { createdAt: 'desc' }, take: 5 },
          approvalEvents: { orderBy: { createdAt: 'desc' }, take: 5 },
          idea: { select: { title: true, pillarId: true, pillar: { select: { labelEs: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.db.contentItem.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toItemWithApprovalsDto(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }
}

export const contentService = new ContentService();

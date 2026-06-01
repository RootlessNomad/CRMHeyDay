import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import {
  anthropicClient,
  parseAiJson as safeJsonParse,
  type AnthropicClient,
} from '../../core/ai/index.js';
import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import type {
  ContentGenerationPayload,
  ContentIdeaPayload,
  JobResult,
} from '../../core/queue/types.js';
import { auditService, type AuditService } from '../audit/index.js';
import { buildDraftPrompt, buildIdeaPrompt } from './prompts.js';

type AiClientLike = Pick<AnthropicClient, 'complete'>;

const IdeaCompletionSchema = z.array(
  z.object({
    title: z.string().trim().min(1).max(200),
    angle: z.string().trim().min(1).max(500),
  }),
);

const DraftCompletionSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1),
  hooks: z.array(z.string().trim().min(1)).optional(),
  ctas: z.array(z.string().trim().min(1)).optional(),
  hashtags: z.array(z.string().trim().min(1)).optional(),
});

export interface RunIdeaGenerationDeps {
  prisma?: PrismaClient;
  ai?: AiClientLike;
  audit?: AuditService;
  now?: () => Date;
}

export async function runIdeaGeneration(
  payload: ContentIdeaPayload,
  deps: RunIdeaGenerationDeps = {},
): Promise<JobResult> {
  const prisma = deps.prisma ?? defaultPrisma;
  const ai = deps.ai ?? anthropicClient;
  const audit = deps.audit ?? auditService;

  const pillar = await prisma.contentPillar.findUnique({ where: { id: payload.pillarId } });
  if (!pillar) throw new Error('Pillar not found');

  const serviceLine = payload.serviceLineId
    ? await prisma.serviceLine.findUnique({ where: { id: payload.serviceLineId } })
    : null;

  const completion = await ai.complete({
    feature: 'content_idea',
    userId: payload.actorUserId,
    ...buildIdeaPrompt({
      pillar,
      vertical: payload.icpVertical,
      serviceLine,
      briefEs: payload.briefEs,
      count: payload.count,
    }),
  });

  const parsedJson = safeJsonParse<unknown>(completion.text);
  const ideas = IdeaCompletionSchema.parse(parsedJson).slice(0, payload.count);
  const ideaIds: string[] = [];

  for (const idea of ideas) {
    const created = await prisma.contentIdea.create({
      data: {
        title: idea.title,
        angle: idea.angle,
        pillarId: payload.pillarId,
        serviceLineId: payload.serviceLineId,
        icpVertical: payload.icpVertical,
        briefEs: payload.briefEs,
        status: 'idea',
        createdById: payload.actorUserId,
      },
    });
    ideaIds.push(created.id);
  }

  await audit.record({
    actorUserId: payload.actorUserId,
    action: 'content_idea.generated',
    entityType: 'content_pillar',
    entityId: payload.pillarId,
    metadata: { count: ideaIds.length, pillarId: payload.pillarId, ideaIds },
  });

  return {
    ok: true,
    summary: {
      ideaIds,
      count: ideaIds.length,
      modelUsed: completion.modelUsed,
      costUsd: completion.costUsd,
    },
  };
}

export async function runContentGeneration(
  payload: ContentGenerationPayload,
  deps: RunIdeaGenerationDeps = {},
): Promise<JobResult> {
  const prisma = deps.prisma ?? defaultPrisma;
  const ai = deps.ai ?? anthropicClient;
  const audit = deps.audit ?? auditService;

  const item = await prisma.contentItem.findUnique({
    where: { id: payload.contentItemId },
    include: {
      idea: {
        include: {
          pillar: true,
          serviceLine: true,
        },
      },
    },
  });
  if (!item || item.deletedAt) throw new Error('Content item not found');

  const completion = await ai.complete({
    feature: 'content_draft',
    userId: payload.actorUserId,
    ...buildDraftPrompt({
      channel: item.channel,
      idea: {
        title: item.idea.title,
        angle: item.idea.angle,
        briefEs: payload.guidance ?? item.idea.briefEs,
      },
      pillar: {
        labelEs: item.idea.pillar.labelEs,
        descriptionEs: item.idea.pillar.descriptionEs,
      },
      vertical: item.idea.icpVertical,
    }),
  });

  const parsedJson = safeJsonParse<unknown>(completion.text);
  const draft = DraftCompletionSchema.parse(parsedJson);

  const result = await prisma.$transaction(async (tx) => {
    const version = await tx.contentVersion.create({
      data: {
        itemId: item.id,
        versionNumber: 1,
        title: draft.title ?? null,
        body: draft.body,
        hooks: draft.hooks ?? [],
        ctas: draft.ctas ?? [],
        hashtags: draft.hashtags ?? [],
        meta: {},
        generatedBy: 'claude',
        editedById: payload.actorUserId,
      },
    });

    await tx.contentItem.update({
      where: { id: item.id },
      data: { currentVersionId: version.id },
    });

    return version;
  });

  await audit.record({
    actorUserId: payload.actorUserId,
    action: 'content_item.draft_generated',
    entityType: 'content_item',
    entityId: item.id,
    metadata: { itemId: item.id, channel: item.channel, costUsd: completion.costUsd },
  });

  return {
    ok: true,
    summary: {
      itemId: item.id,
      versionId: result.id,
      channel: item.channel,
      modelUsed: completion.modelUsed,
      costUsd: completion.costUsd,
    },
  };
}

import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runContentGeneration, runIdeaGeneration } from './handlers.js';

function buildPrisma() {
  const ideas: Array<{ id: string; title: string; angle: string }> = [];
  const versions: Array<{ id: string; itemId: string }> = [];
  const item = {
    id: 'item_1',
    channel: 'instagram' as const,
    deletedAt: null,
    idea: {
      title: 'Idea',
      angle: 'Angle',
      briefEs: 'Brief',
      icpVertical: 'physiotherapy' as const,
      pillar: { labelEs: 'Educacion', descriptionEs: 'Desc' },
      serviceLine: null,
    },
  };

  const prisma = {
    contentPillar: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'missing'
          ? null
          : { id: where.id, key: 'pillar', labelEs: 'Educacion', descriptionEs: 'Desc' },
      ),
    },
    serviceLine: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        key: 'website',
        labelEs: 'Website',
        descriptionEs: 'Desc',
      })),
    },
    contentIdea: {
      create: vi.fn(async ({ data }: { data: { title: string; angle: string } }) => {
        const created = { id: `idea_${ideas.length + 1}`, ...data };
        ideas.push(created);
        return created;
      }),
    },
    contentItem: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'missing') return null;
        if (where.id === 'deleted') return { ...item, id: 'deleted', deletedAt: new Date() };
        return item;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: { currentVersionId: string } }) => ({
          id: where.id,
          ...data,
        }),
      ),
    },
    contentVersion: {
      create: vi.fn(async ({ data }: { data: { itemId: string } }) => {
        const created = { id: `version_${versions.length + 1}`, itemId: data.itemId };
        versions.push(created);
        return created;
      }),
    },
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
  };

  return { prisma, ideas, versions };
}

describe('content handlers', () => {
  const audit = { record: vi.fn(async () => undefined) };
  const ai = { complete: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runIdeaGeneration happy path crea ideas y retorna ideaIds', async () => {
    const { prisma, ideas } = buildPrisma();
    ai.complete.mockResolvedValue({
      text: JSON.stringify([
        { title: 'Idea 1', angle: 'Angle 1' },
        { title: 'Idea 2', angle: 'Angle 2' },
      ]),
      modelUsed: 'claude',
      usage: {},
      costUsd: 0.12,
    });

    const result = await runIdeaGeneration(
      {
        pillarId: 'pillar_1',
        briefEs: 'Brief',
        actorUserId: 'user_1',
        count: 2,
      },
      { prisma: prisma as unknown as PrismaClient, ai, audit: audit as never },
    );

    expect(ideas).toHaveLength(2);
    expect(result.summary).toMatchObject({ count: 2, ideaIds: ['idea_1', 'idea_2'] });
  });

  it('runIdeaGeneration JSON invalido de AI lanza', async () => {
    const { prisma } = buildPrisma();
    ai.complete.mockResolvedValue({
      text: 'no json',
      modelUsed: 'claude',
      usage: {},
      costUsd: 0.1,
    });

    await expect(
      runIdeaGeneration(
        { pillarId: 'pillar_1', briefEs: 'Brief', actorUserId: 'user_1', count: 3 },
        { prisma: prisma as unknown as PrismaClient, ai, audit: audit as never },
      ),
    ).rejects.toThrow();
  });

  it('runIdeaGeneration pillar inexistente lanza', async () => {
    const { prisma } = buildPrisma();

    await expect(
      runIdeaGeneration(
        { pillarId: 'missing', briefEs: 'Brief', actorUserId: 'user_1', count: 3 },
        { prisma: prisma as unknown as PrismaClient, ai, audit: audit as never },
      ),
    ).rejects.toThrow('Pillar not found');
  });

  it('runContentGeneration happy path crea ContentVersion y actualiza currentVersionId', async () => {
    const { prisma, versions } = buildPrisma();
    ai.complete.mockResolvedValue({
      text: JSON.stringify({
        title: 'Draft title',
        body: 'Draft body',
        hooks: ['Hook'],
        ctas: ['CTA'],
        hashtags: ['#heyday'],
      }),
      modelUsed: 'claude',
      usage: {},
      costUsd: 0.3,
    });

    const result = await runContentGeneration(
      { contentItemId: 'item_1', actorUserId: 'user_1' },
      { prisma: prisma as unknown as PrismaClient, ai, audit: audit as never },
    );

    expect(versions).toHaveLength(1);
    expect(result.summary).toMatchObject({ itemId: 'item_1', versionId: 'version_1' });
  });

  it('runContentGeneration item soft-deleted lanza', async () => {
    const { prisma } = buildPrisma();

    await expect(
      runContentGeneration(
        { contentItemId: 'deleted', actorUserId: 'user_1' },
        { prisma: prisma as unknown as PrismaClient, ai, audit: audit as never },
      ),
    ).rejects.toThrow('Content item not found');
  });

  it('runContentGeneration JSON invalido lanza', async () => {
    const { prisma } = buildPrisma();
    ai.complete.mockResolvedValue({
      text: '{"title":"ok"}',
      modelUsed: 'claude',
      usage: {},
      costUsd: 0.1,
    });

    await expect(
      runContentGeneration(
        { contentItemId: 'item_1', actorUserId: 'user_1' },
        { prisma: prisma as unknown as PrismaClient, ai, audit: audit as never },
      ),
    ).rejects.toThrow();
  });
});

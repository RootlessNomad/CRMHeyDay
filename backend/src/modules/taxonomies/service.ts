import type { PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';

export interface PainPointCategoryDto {
  id: string;
  key: string;
  labelEs: string;
  descriptionEs: string;
  defaultServiceRecommendations: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceLineDto {
  id: string;
  key: string;
  labelEs: string;
  descriptionEs: string;
  subCapabilities: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentPillarDto {
  id: string;
  key: string;
  labelEs: string;
  descriptionEs: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePainPointCategoryInput {
  key: string;
  labelEs: string;
  descriptionEs: string;
  defaultServiceRecommendations?: string[];
}

export interface UpdatePainPointCategoryInput {
  labelEs?: string;
  descriptionEs?: string;
  defaultServiceRecommendations?: string[];
  isActive?: boolean;
}

export interface CreateServiceLineInput {
  key: string;
  labelEs: string;
  descriptionEs: string;
  subCapabilities?: unknown[];
}

export interface UpdateServiceLineInput {
  labelEs?: string;
  descriptionEs?: string;
  subCapabilities?: unknown[];
  isActive?: boolean;
}

export interface CreateContentPillarInput {
  key: string;
  labelEs: string;
  descriptionEs: string;
}

export interface UpdateContentPillarInput {
  labelEs?: string;
  descriptionEs?: string;
  isActive?: boolean;
}

export class TaxonomyNotFoundError extends Error {
  readonly code = 'TAXONOMY_NOT_FOUND';
  constructor(entity: string, id: string) {
    super(`${entity} '${id}' no encontrado`);
    this.name = 'TaxonomyNotFoundError';
  }
}

export class TaxonomyConflictError extends Error {
  readonly code = 'TAXONOMY_CONFLICT';
  constructor(entity: string, key: string) {
    super(`Ya existe un ${entity} con key '${key}'`);
    this.name = 'TaxonomyConflictError';
  }
}

export class TaxonomiesService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  // ------------------------------------------------------------------
  // PainPointCategory
  // ------------------------------------------------------------------
  async listPainPointCategories(): Promise<PainPointCategoryDto[]> {
    const rows = await this.db.painPointCategory.findMany({ orderBy: { key: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      labelEs: r.labelEs,
      descriptionEs: r.descriptionEs,
      defaultServiceRecommendations: r.defaultServiceRecommendations,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createPainPointCategory(
    input: CreatePainPointCategoryInput,
  ): Promise<PainPointCategoryDto> {
    const existing = await this.db.painPointCategory.findUnique({ where: { key: input.key } });
    if (existing) throw new TaxonomyConflictError('PainPointCategory', input.key);

    const created = await this.db.painPointCategory.create({
      data: {
        key: input.key,
        labelEs: input.labelEs,
        descriptionEs: input.descriptionEs,
        defaultServiceRecommendations: input.defaultServiceRecommendations ?? [],
      },
    });

    return {
      id: created.id,
      key: created.key,
      labelEs: created.labelEs,
      descriptionEs: created.descriptionEs,
      defaultServiceRecommendations: created.defaultServiceRecommendations,
      isActive: created.isActive,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async updatePainPointCategory(
    id: string,
    input: UpdatePainPointCategoryInput,
  ): Promise<PainPointCategoryDto> {
    const existing = await this.db.painPointCategory.findUnique({ where: { id } });
    if (!existing) throw new TaxonomyNotFoundError('PainPointCategory', id);

    const updated = await this.db.painPointCategory.update({
      where: { id },
      data: {
        ...(input.labelEs !== undefined && { labelEs: input.labelEs }),
        ...(input.descriptionEs !== undefined && { descriptionEs: input.descriptionEs }),
        ...(input.defaultServiceRecommendations !== undefined && {
          defaultServiceRecommendations: input.defaultServiceRecommendations,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    return {
      id: updated.id,
      key: updated.key,
      labelEs: updated.labelEs,
      descriptionEs: updated.descriptionEs,
      defaultServiceRecommendations: updated.defaultServiceRecommendations,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  // ------------------------------------------------------------------
  // ServiceLine
  // ------------------------------------------------------------------
  async listServiceLines(): Promise<ServiceLineDto[]> {
    const rows = await this.db.serviceLine.findMany({ orderBy: { key: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      labelEs: r.labelEs,
      descriptionEs: r.descriptionEs,
      subCapabilities: r.subCapabilities,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createServiceLine(input: CreateServiceLineInput): Promise<ServiceLineDto> {
    const existing = await this.db.serviceLine.findUnique({ where: { key: input.key } });
    if (existing) throw new TaxonomyConflictError('ServiceLine', input.key);

    const created = await this.db.serviceLine.create({
      data: {
        key: input.key,
        labelEs: input.labelEs,
        descriptionEs: input.descriptionEs,
        subCapabilities: (input.subCapabilities ?? []) as never,
      },
    });

    return {
      id: created.id,
      key: created.key,
      labelEs: created.labelEs,
      descriptionEs: created.descriptionEs,
      subCapabilities: created.subCapabilities,
      isActive: created.isActive,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async updateServiceLine(id: string, input: UpdateServiceLineInput): Promise<ServiceLineDto> {
    const existing = await this.db.serviceLine.findUnique({ where: { id } });
    if (!existing) throw new TaxonomyNotFoundError('ServiceLine', id);

    const updated = await this.db.serviceLine.update({
      where: { id },
      data: {
        ...(input.labelEs !== undefined && { labelEs: input.labelEs }),
        ...(input.descriptionEs !== undefined && { descriptionEs: input.descriptionEs }),
        ...(input.subCapabilities !== undefined && {
          subCapabilities: input.subCapabilities as never,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    return {
      id: updated.id,
      key: updated.key,
      labelEs: updated.labelEs,
      descriptionEs: updated.descriptionEs,
      subCapabilities: updated.subCapabilities,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  // ------------------------------------------------------------------
  // ContentPillar
  // ------------------------------------------------------------------
  async listContentPillars(): Promise<ContentPillarDto[]> {
    const rows = await this.db.contentPillar.findMany({ orderBy: { key: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      labelEs: r.labelEs,
      descriptionEs: r.descriptionEs,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createContentPillar(input: CreateContentPillarInput): Promise<ContentPillarDto> {
    const existing = await this.db.contentPillar.findUnique({ where: { key: input.key } });
    if (existing) throw new TaxonomyConflictError('ContentPillar', input.key);

    const created = await this.db.contentPillar.create({
      data: {
        key: input.key,
        labelEs: input.labelEs,
        descriptionEs: input.descriptionEs,
      },
    });

    return {
      id: created.id,
      key: created.key,
      labelEs: created.labelEs,
      descriptionEs: created.descriptionEs,
      isActive: created.isActive,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async updateContentPillar(
    id: string,
    input: UpdateContentPillarInput,
  ): Promise<ContentPillarDto> {
    const existing = await this.db.contentPillar.findUnique({ where: { id } });
    if (!existing) throw new TaxonomyNotFoundError('ContentPillar', id);

    const updated = await this.db.contentPillar.update({
      where: { id },
      data: {
        ...(input.labelEs !== undefined && { labelEs: input.labelEs }),
        ...(input.descriptionEs !== undefined && { descriptionEs: input.descriptionEs }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    return {
      id: updated.id,
      key: updated.key,
      labelEs: updated.labelEs,
      descriptionEs: updated.descriptionEs,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}

export const taxonomiesService = new TaxonomiesService();

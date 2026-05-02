import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  taxonomiesService,
  TaxonomyConflictError,
  TaxonomyNotFoundError,
} from '../../modules/taxonomies/index.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });

const KEY_SCHEMA = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, dígitos y _');

// PainPointCategory schemas
const CreatePainPointCategorySchema = z.object({
  key: KEY_SCHEMA,
  labelEs: z.string().trim().min(1).max(200),
  descriptionEs: z.string().trim().min(1).max(500),
  defaultServiceRecommendations: z.array(z.string()).optional(),
});

const UpdatePainPointCategorySchema = z.object({
  labelEs: z.string().trim().min(1).max(200).optional(),
  descriptionEs: z.string().trim().min(1).max(500).optional(),
  defaultServiceRecommendations: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// ServiceLine schemas
const CreateServiceLineSchema = z.object({
  key: KEY_SCHEMA,
  labelEs: z.string().trim().min(1).max(200),
  descriptionEs: z.string().trim().min(1).max(500),
  subCapabilities: z.array(z.unknown()).optional(),
});

const UpdateServiceLineSchema = z.object({
  labelEs: z.string().trim().min(1).max(200).optional(),
  descriptionEs: z.string().trim().min(1).max(500).optional(),
  subCapabilities: z.array(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// ContentPillar schemas
const CreateContentPillarSchema = z.object({
  key: KEY_SCHEMA,
  labelEs: z.string().trim().min(1).max(200),
  descriptionEs: z.string().trim().min(1).max(500),
});

const UpdateContentPillarSchema = z.object({
  labelEs: z.string().trim().min(1).max(200).optional(),
  descriptionEs: z.string().trim().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
});

function handleTaxonomyError(app: FastifyInstance, err: unknown, _entity: string): never {
  if (err instanceof TaxonomyNotFoundError) throw app.httpErrors.notFound(err.message);
  if (err instanceof TaxonomyConflictError) throw app.httpErrors.conflict(err.message);
  throw err;
}

export async function registerTaxonomiesRoutes(app: FastifyInstance): Promise<void> {
  const authGuard = { preHandler: [app.requireAuth] };
  const adminGuard = { preHandler: [app.requireAuth, app.requireRole('admin')] };

  // ------------------------------------------------------------------
  // PainPointCategory — /intel/taxonomies/pain-points
  // ------------------------------------------------------------------
  app.get('/intel/taxonomies/pain-points', authGuard, async (_request, reply) => {
    const list = await taxonomiesService.listPainPointCategories();
    return reply.code(200).send(list);
  });

  app.post('/intel/taxonomies/pain-points', adminGuard, async (request, reply) => {
    const body = CreatePainPointCategorySchema.parse(request.body);
    try {
      const created = await taxonomiesService.createPainPointCategory(body);
      return reply.code(201).send(created);
    } catch (err) {
      handleTaxonomyError(app, err, 'PainPointCategory');
    }
  });

  app.patch('/intel/taxonomies/pain-points/:id', adminGuard, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = UpdatePainPointCategorySchema.parse(request.body);
    try {
      const updated = await taxonomiesService.updatePainPointCategory(id, body);
      return reply.code(200).send(updated);
    } catch (err) {
      handleTaxonomyError(app, err, 'PainPointCategory');
    }
  });

  // ------------------------------------------------------------------
  // ServiceLine — /intel/service-lines
  // ------------------------------------------------------------------
  app.get('/intel/service-lines', authGuard, async (_request, reply) => {
    const list = await taxonomiesService.listServiceLines();
    return reply.code(200).send(list);
  });

  app.post('/intel/service-lines', adminGuard, async (request, reply) => {
    const body = CreateServiceLineSchema.parse(request.body);
    try {
      const created = await taxonomiesService.createServiceLine(body);
      return reply.code(201).send(created);
    } catch (err) {
      handleTaxonomyError(app, err, 'ServiceLine');
    }
  });

  app.patch('/intel/service-lines/:id', adminGuard, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = UpdateServiceLineSchema.parse(request.body);
    try {
      const updated = await taxonomiesService.updateServiceLine(id, body);
      return reply.code(200).send(updated);
    } catch (err) {
      handleTaxonomyError(app, err, 'ServiceLine');
    }
  });

  // ------------------------------------------------------------------
  // ContentPillar — /content/pillars
  // ------------------------------------------------------------------
  app.get('/content/pillars', authGuard, async (_request, reply) => {
    const list = await taxonomiesService.listContentPillars();
    return reply.code(200).send(list);
  });

  app.post('/content/pillars', adminGuard, async (request, reply) => {
    const body = CreateContentPillarSchema.parse(request.body);
    try {
      const created = await taxonomiesService.createContentPillar(body);
      return reply.code(201).send(created);
    } catch (err) {
      handleTaxonomyError(app, err, 'ContentPillar');
    }
  });

  app.patch('/content/pillars/:id', adminGuard, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = UpdateContentPillarSchema.parse(request.body);
    try {
      const updated = await taxonomiesService.updateContentPillar(id, body);
      return reply.code(200).send(updated);
    } catch (err) {
      handleTaxonomyError(app, err, 'ContentPillar');
    }
  });
}

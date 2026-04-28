import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  createPipelineSchema,
  createStageSchema,
  pipelinesService,
  updatePipelineSchema,
  updateStageSchema,
} from '../../modules/pipelines/index.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });

export async function registerPipelinesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/pipelines', { preHandler: [app.requireAuth] }, async () => {
    return pipelinesService.list();
  });

  app.post('/pipelines', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = createPipelineSchema.parse(request.body);
    const pipeline = await pipelinesService.create(body);
    return reply.code(201).send(pipeline);
  });

  app.patch('/pipelines/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = updatePipelineSchema.parse(request.body);
    return pipelinesService.update(id, body);
  });

  app.post('/pipelines/:id/stages', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = createStageSchema.parse(request.body);
    const stage = await pipelinesService.addStage(id, body);
    return reply.code(201).send(stage);
  });

  app.patch('/pipeline-stages/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = updateStageSchema.parse(request.body);
    return pipelinesService.updateStage(id, body);
  });

  app.delete('/pipeline-stages/:id', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    await pipelinesService.deleteStage(id);
    return reply.code(204).send();
  });
}

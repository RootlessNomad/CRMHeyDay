import type { FastifyInstance } from 'fastify';

import { SearchQuerySchema, searchService } from '../../modules/search/index.js';

export async function registerSearchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/search', { preHandler: [app.requireAuth] }, async (request) => {
    const query = SearchQuerySchema.parse(request.query);
    return searchService.searchAll(query);
  });
}

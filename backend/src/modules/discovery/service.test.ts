import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { DiscoveryPayload } from '../../core/queue/types.js';
import type { PlaceResult } from '../../core/sources/google-places.js';
import {
  CompanyDomainConflictError,
  type CompaniesService,
  type CompanyDto,
} from '../companies/index.js';
import { DiscoveryService } from './service.js';

function makePlace(overrides: Partial<PlaceResult> = {}): PlaceResult {
  return {
    placeId: `place_${Math.random().toString(36).slice(2)}`,
    name: 'Super Gym',
    website: 'https://supergym.example',
    phone: '+34 600 000 000',
    city: 'Madrid',
    rating: 4.6,
    userRatingCount: 120,
    mapsUrl: 'https://maps.google.com/?cid=1',
    address: 'Calle Falsa 123, Madrid',
    ...overrides,
  };
}

function makeCompanyDto(overrides: Partial<CompanyDto> = {}): CompanyDto {
  return {
    id: `company_${Math.random().toString(36).slice(2)}`,
    name: 'Super Gym',
    website: 'https://supergym.example',
    domain: 'supergym.example',
    industry: null,
    icp_vertical: 'gym_fitness',
    country: 'ES',
    region: null,
    city: 'Madrid',
    postal_code: null,
    address: null,
    size_signal: null,
    phone: '+34 600 000 000',
    email: null,
    whatsapp: null,
    linkedin_url: null,
    instagram_handle: null,
    notes: null,
    demo_link: null,
    created_by_id: 'user_admin',
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

function prismaWithFindFirst(result: { id: string } | null): PrismaClient {
  return {
    company: { findFirst: vi.fn().mockResolvedValue(result) },
  } as unknown as PrismaClient;
}

const basePayload: DiscoveryPayload = {
  city: 'Madrid',
  businessType: 'gimnasio',
  maxResults: 20,
  triggerEnrichment: false,
  actorUserId: 'user_admin',
};

describe('DiscoveryService.run', () => {
  it('creates a company per place and maps the vertical', async () => {
    const create = vi.fn(async (input: { name: string }) => makeCompanyDto({ name: input.name }));
    const service = new DiscoveryService(prismaWithFindFirst(null));

    const result = await service.run(basePayload, {
      prisma: prismaWithFindFirst(null),
      companies: { create } as unknown as CompaniesService,
      search: async () => [makePlace({ name: 'A' }), makePlace({ name: 'B' })],
      getApiKey: async () => 'key',
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      icp_vertical: 'gym_fitness',
      country: 'ES',
      city: 'Madrid',
    });
    expect(result.summary).toMatchObject({ found: 2, created: 2, duplicated: 0, enriched: 0 });
  });

  it('counts a place as duplicate when name+city already exists (secondary dedup)', async () => {
    const create = vi.fn();
    const service = new DiscoveryService();

    const result = await service.run(basePayload, {
      prisma: prismaWithFindFirst({ id: 'existing_1' }),
      companies: { create } as unknown as CompaniesService,
      search: async () => [makePlace()],
      getApiKey: async () => 'key',
    });

    expect(create).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({ created: 0, duplicated: 1 });
  });

  it('counts a domain conflict from CompaniesService.create as duplicate', async () => {
    const create = vi.fn(async () => {
      throw new CompanyDomainConflictError('existing_2', 'supergym.example');
    });
    const service = new DiscoveryService();

    const result = await service.run(basePayload, {
      prisma: prismaWithFindFirst(null),
      companies: { create } as unknown as CompaniesService,
      search: async () => [makePlace()],
      getApiKey: async () => 'key',
    });

    expect(result.summary).toMatchObject({ created: 0, duplicated: 1, errors: 0 });
  });

  it('triggers enrichment only for created companies that have a website', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(makeCompanyDto({ website: 'https://withweb.example' }))
      .mockResolvedValueOnce(makeCompanyDto({ website: null }));
    const enrichCompany = vi.fn(async () => {});
    const service = new DiscoveryService();

    const result = await service.run(
      { ...basePayload, triggerEnrichment: true },
      {
        prisma: prismaWithFindFirst(null),
        companies: { create } as unknown as CompaniesService,
        search: async () => [
          makePlace({ name: 'WithWeb', website: 'https://withweb.example' }),
          makePlace({ name: 'NoWeb', website: null }),
        ],
        getApiKey: async () => 'key',
        enrichCompany,
      },
    );

    expect(enrichCompany).toHaveBeenCalledTimes(1);
    expect(result.summary).toMatchObject({ created: 2, enriched: 1 });
  });
});

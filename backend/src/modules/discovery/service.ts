import type { PrismaClient } from '@prisma/client';

import { secretsResolver } from '../../core/config/secrets.js';
import { rootLogger } from '../../core/observability/logger.js';
import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { enqueue, QUEUE_NAMES } from '../../core/queue/queues.js';
import type { DiscoveryPayload, JobResult } from '../../core/queue/types.js';
import {
  searchGooglePlaces as defaultSearchGooglePlaces,
  type PlaceResult,
} from '../../core/sources/google-places.js';
import {
  type CompaniesService,
  CompanyDomainConflictError,
  companiesService,
  type CompanyDto,
} from '../companies/index.js';
import { intelService } from '../intel/index.js';
import {
  type BulkDiscoveryRequest,
  type BulkDiscoverySummary,
  mapBusinessTypeToVertical,
} from './schemas.js';

const log = rootLogger.child({ component: 'discovery.service' });

const GOOGLE_PLACES_KEY = 'google_places';

export interface RunDiscoveryDeps {
  prisma?: PrismaClient;
  companies?: CompaniesService;
  search?: typeof defaultSearchGooglePlaces;
  /** Resuelve la API key (vault). Inyectable para tests. */
  getApiKey?: () => Promise<string>;
  /** Crea EnrichmentRun + encola enrichment. Inyectable para tests. */
  enrichCompany?: (companyId: string, actorUserId: string) => Promise<void>;
}

export class DiscoveryService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  /**
   * Encola un job de discovery y devuelve el `jobId` (mirror DB) para la UI.
   * Llamado desde la ruta REST.
   */
  async enqueueBulkDiscovery(
    input: BulkDiscoveryRequest,
    actorUserId: string,
  ): Promise<{ jobId: string }> {
    const { jobId } = await enqueue(QUEUE_NAMES.discovery, {
      city: input.city,
      businessType: input.businessType,
      maxResults: input.maxResults ?? 20,
      triggerEnrichment: input.triggerEnrichment,
      actorUserId,
    });
    return { jobId };
  }

  /**
   * Procesa el job: busca en Google Places y crea Companies deduplicadas.
   * Ejecutado por el worker.
   */
  async run(payload: DiscoveryPayload, deps: RunDiscoveryDeps = {}): Promise<JobResult> {
    const db = deps.prisma ?? this.db;
    const companies = deps.companies ?? companiesService;
    const search = deps.search ?? defaultSearchGooglePlaces;
    const getApiKey = deps.getApiKey ?? (() => secretsResolver.get(GOOGLE_PLACES_KEY));
    const enrichCompany =
      deps.enrichCompany ??
      (async (companyId: string, actorUserId: string) => {
        await intelService.createEnrichmentRun({ companyId }, actorUserId);
      });

    const vertical = mapBusinessTypeToVertical(payload.businessType);
    const apiKey = await getApiKey();

    const places = await search({
      city: payload.city,
      businessType: payload.businessType,
      apiKey,
      maxResults: payload.maxResults,
    });

    let created = 0;
    let duplicated = 0;
    let enriched = 0;
    let errors = 0;

    for (const place of places) {
      const cityForPlace = place.city ?? payload.city;
      try {
        if (await this.isDuplicate(db, place, cityForPlace)) {
          duplicated += 1;
          continue;
        }

        let company: CompanyDto;
        try {
          company = await companies.create(
            {
              name: place.name,
              website: place.website,
              icp_vertical: vertical,
              city: cityForPlace,
              phone: place.phone,
              country: 'ES',
            },
            payload.actorUserId,
          );
        } catch (error) {
          if (error instanceof CompanyDomainConflictError) {
            duplicated += 1;
            continue;
          }
          throw error;
        }

        created += 1;

        // Solo enriquecemos negocios con web (el enrichment scrapea su sitio).
        if (payload.triggerEnrichment && company.website) {
          try {
            await enrichCompany(company.id, payload.actorUserId);
            enriched += 1;
          } catch (error) {
            errors += 1;
            log.warn(
              {
                companyId: company.id,
                err: error instanceof Error ? error.message : String(error),
              },
              'discovery: enrichment enqueue failed',
            );
          }
        }
      } catch (error) {
        errors += 1;
        log.warn(
          { placeId: place.placeId, err: error instanceof Error ? error.message : String(error) },
          'discovery: failed to process place',
        );
      }
    }

    const summary: BulkDiscoverySummary = {
      city: payload.city,
      businessType: payload.businessType,
      vertical,
      found: places.length,
      created,
      duplicated,
      enriched,
      errors,
    };
    log.info(summary, 'discovery run complete');
    return { ok: true, summary };
  }

  /**
   * Dedup secundario para negocios sin web (domain null → el dedup por dominio
   * de CompaniesService no aplica). Coincidencia por (nombre + ciudad) o teléfono.
   */
  private async isDuplicate(
    db: PrismaClient,
    place: PlaceResult,
    cityForPlace: string,
  ): Promise<boolean> {
    const existing = await db.company.findFirst({
      where: {
        deletedAt: null,
        OR: [
          {
            name: { equals: place.name, mode: 'insensitive' },
            city: { equals: cityForPlace, mode: 'insensitive' },
          },
          ...(place.phone ? [{ phone: place.phone }] : []),
        ],
      },
      select: { id: true },
    });
    return existing !== null;
  }
}

export const discoveryService = new DiscoveryService();

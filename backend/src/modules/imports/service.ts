import type { Prisma, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { auditService } from '../../modules/audit/service.js';
import type { AuditService } from '../../modules/audit/service.js';
import { normalizeDomain } from '../companies/domain.js';
import type { CompanyCreateInput } from '../companies/schemas.js';
import { parseCompanyCsv, type RowError } from './domain.js';
import { CsvRowSchema, type ImportResultDto } from './schemas.js';

const IMPORT_ROW_LIMIT = 1000;

export class ImportHeaderError extends Error {
  constructor(public readonly headers: string[]) {
    super('Missing required CSV headers');
    this.name = 'ImportHeaderError';
  }
}

export class ImportCapError extends Error {
  constructor(public readonly limit: number) {
    super(`CSV row limit exceeded (${limit})`);
    this.name = 'ImportCapError';
  }
}

function countDataRows(buffer: Buffer): number {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  const nonEmptyLines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length === 0) return 0;
  return Math.max(nonEmptyLines.length - 1, 0);
}

function toCreateData(
  input: CompanyCreateInput,
  userId: string,
  domain: string | null,
): Prisma.CompanyCreateInput {
  return {
    name: input.name,
    website: input.website ?? null,
    domain,
    industry: input.industry ?? null,
    icpVertical: input.icp_vertical ?? null,
    country: input.country,
    region: input.region ?? null,
    city: input.city ?? null,
    postalCode: input.postal_code ?? null,
    address: input.address ?? null,
    sizeSignal: input.size_signal ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    whatsapp: input.whatsapp ?? null,
    linkedinUrl: input.linkedin_url ?? null,
    instagramHandle: input.instagram_handle ?? null,
    notes: input.notes ?? null,
    createdBy: { connect: { id: userId } },
  };
}

interface ValidatedRow {
  rowNumber: number;
  input: CompanyCreateInput;
  normalizedDomain: string | null;
}

export class CompaniesImportService {
  private readonly db: PrismaClient;

  private readonly audit: AuditService;

  constructor(db: PrismaClient = defaultPrisma, audit: AuditService = auditService) {
    this.db = db;
    this.audit = audit;
  }

  async run(buffer: Buffer, userId: string, dryRun: boolean): Promise<ImportResultDto> {
    if (countDataRows(buffer) > IMPORT_ROW_LIMIT) throw new ImportCapError(IMPORT_ROW_LIMIT);

    const { rows, headerErrors } = parseCompanyCsv(buffer);
    if (headerErrors.length > 0) throw new ImportHeaderError(headerErrors);

    const errors: RowError[] = [];
    const validRows: ValidatedRow[] = [];

    for (const row of rows) {
      const parsed = CsvRowSchema.safeParse(row);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push({
            row: row._raw_row_number,
            code: 'validation',
            field: issue.path[0]?.toString(),
            message: issue.message,
          });
        }
        continue;
      }

      const normalizedDomain =
        normalizeDomain(parsed.data.domain) ?? normalizeDomain(parsed.data.website);
      validRows.push({
        rowNumber: row._raw_row_number,
        input: { ...parsed.data, domain: normalizedDomain },
        normalizedDomain,
      });
    }

    const dedupedRows: ValidatedRow[] = [];
    const seenDomains = new Set<string>();
    for (const row of validRows) {
      if (row.normalizedDomain && seenDomains.has(row.normalizedDomain)) {
        errors.push({
          row: row.rowNumber,
          code: 'duplicate_in_csv',
          field: 'domain',
          message: `Duplicate domain in CSV: ${row.normalizedDomain}`,
        });
        continue;
      }
      if (row.normalizedDomain) seenDomains.add(row.normalizedDomain);
      dedupedRows.push(row);
    }

    const validDomains = dedupedRows
      .map((row) => row.normalizedDomain)
      .filter((domain): domain is string => domain !== null);

    const existingCompanies = validDomains.length
      ? await this.db.company.findMany({
          where: { domain: { in: validDomains }, deletedAt: null },
        })
      : [];
    const existingByDomain = new Map(existingCompanies.map((company) => [company.domain, company]));

    const creatableRows: ValidatedRow[] = [];
    for (const row of dedupedRows) {
      if (row.normalizedDomain) {
        const existing = existingByDomain.get(row.normalizedDomain);
        if (existing) {
          errors.push({
            row: row.rowNumber,
            code: 'duplicate_in_db',
            field: 'domain',
            message: `Domain already exists: ${row.normalizedDomain}`,
            existing_id: existing.id,
          });
          continue;
        }
      }
      creatableRows.push(row);
    }

    let rowsCreated = creatableRows.length;
    if (!dryRun) {
      rowsCreated = 0;
      for (const row of creatableRows) {
        try {
          await this.db.company.create({
            data: toCreateData(row.input, userId, row.normalizedDomain),
          });
          rowsCreated += 1;
        } catch (err) {
          errors.push({
            row: row.rowNumber,
            code: 'validation',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const result: ImportResultDto = {
      rows_total: rows.length,
      rows_created: rowsCreated,
      rows_skipped_duplicate: errors.filter((error) => error.code !== 'validation').length,
      rows_failed: errors.filter((error) => error.code === 'validation').length,
      errors,
      dry_run: dryRun,
    };

    await this.audit.record({
      action: 'companies.import',
      actorUserId: userId,
      entityType: 'company',
      metadata: {
        rows_total: result.rows_total,
        rows_created: result.rows_created,
        rows_skipped_duplicate: result.rows_skipped_duplicate,
        rows_failed: result.rows_failed,
        dry_run: result.dry_run,
      },
    });

    return result;
  }
}

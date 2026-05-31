import { parse } from 'csv-parse/sync';

import type { CompanyCreateInput } from '../companies/schemas.js';

const REQUIRED_HEADERS = ['name'] as const;
const ACCEPTED_HEADERS = new Set([
  'name',
  'website',
  'domain',
  'industry',
  'icp_vertical',
  'country',
  'region',
  'city',
  'postal_code',
  'address',
  'size_signal',
  'phone',
  'email',
  'whatsapp',
  'linkedin_url',
  'instagram_handle',
  'notes',
  'demo_link',
] as const);

export type ParsedRow = {
  [K in keyof CompanyCreateInput]: CompanyCreateInput[K] | string;
} & { _raw_row_number: number };

export interface RowError {
  row: number;
  code: 'validation' | 'duplicate_in_csv' | 'duplicate_in_db';
  field?: string;
  message: string;
  existing_id?: string;
}

export function parseCompanyCsv(buffer: Buffer): { rows: ParsedRow[]; headerErrors: string[] } {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  const firstNonEmptyLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const discoveredHeaders = new Set(
    firstNonEmptyLine
      .split(',')
      .map((header) => header.trim())
      .filter((header) => header.length > 0),
  );

  const records = parse(buffer, {
    columns: true,
    trim: true,
    skip_empty_lines: true,
    bom: true,
    delimiter: ',',
  }) as Array<Record<string, string>>;

  for (const record of records) {
    for (const key of Object.keys(record)) discoveredHeaders.add(key);
  }

  const headerErrors = REQUIRED_HEADERS.filter((header) => !discoveredHeaders.has(header)).map(
    (header) => `Missing required header: ${header}`,
  );
  if (headerErrors.length > 0) return { rows: [], headerErrors };

  const rows: ParsedRow[] = records.map((record, index) => {
    const row: Partial<ParsedRow> = { _raw_row_number: index + 1 };
    for (const [key, value] of Object.entries(record)) {
      if (!ACCEPTED_HEADERS.has(key as keyof CompanyCreateInput)) continue;
      row[key as keyof CompanyCreateInput] = value;
    }
    return row as ParsedRow;
  });

  return { rows, headerErrors: [] };
}

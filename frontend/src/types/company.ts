import { ICP_VERTICALS, type IcpVertical as SharedIcpVertical } from '@heyday/shared';

export type IcpVertical = SharedIcpVertical;
export type SizeSignal = 'solo' | 'micro_1_5' | 'small_6_25' | 'mid_26_100' | 'unknown';

export interface CompanyDto {
  id: string;
  name: string;
  website: string | null;
  domain: string | null;
  industry: string | null;
  icp_vertical: IcpVertical | null;
  country: string;
  region: string | null;
  city: string | null;
  postal_code: string | null;
  address: string | null;
  size_signal: SizeSignal | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  linkedin_url: string | null;
  instagram_handle: string | null;
  notes: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyListResponse {
  items: CompanyDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CompanyListQuery {
  q?: string;
  icp_vertical?: IcpVertical;
  city?: string;
  page?: number;
  pageSize?: number;
  sort?: 'updated_at_desc';
}

export interface CompanyCreateInput {
  name: string;
  website?: string | null;
  domain?: string | null;
  industry?: string | null;
  icp_vertical?: IcpVertical | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  postal_code?: string | null;
  address?: string | null;
  size_signal?: SizeSignal | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  linkedin_url?: string | null;
  instagram_handle?: string | null;
  notes?: string | null;
}

export type CompanyUpdateInput = Partial<CompanyCreateInput>;

export const SIZE_SIGNALS: readonly SizeSignal[] = [
  'solo',
  'micro_1_5',
  'small_6_25',
  'mid_26_100',
  'unknown',
] as const;

export { ICP_VERTICALS };

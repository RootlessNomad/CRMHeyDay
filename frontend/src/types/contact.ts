export type ConsentStatus =
  | 'unknown'
  | 'public_business_data_only'
  | 'explicit_granted'
  | 'revoked';

export interface ContactDto {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string | null;
  role_title: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkedin_url: string | null;
  is_primary: boolean;
  consent_status: ConsentStatus;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  anonymized_at: string | null;
}

export interface ContactListResponse {
  items: ContactDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ContactListQuery {
  q?: string;
  company_id?: string;
  is_primary?: boolean;
  page?: number;
  pageSize?: number;
  sort?: 'updated_at_desc';
}

export interface ContactCreateInput {
  first_name: string;
  last_name?: string | null;
  role_title?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  linkedin_url?: string | null;
  company_id?: string | null;
  is_primary?: boolean;
  consent_status?: ConsentStatus;
}

export type ContactUpdateInput = Partial<ContactCreateInput>;

export type ActivityKind = 'note' | 'task' | 'call_log' | 'email_log' | 'meeting_log';

export type ActivityEntityType = 'company' | 'contact' | 'lead';

export interface ActivityDto {
  id: string;
  entity_type: ActivityEntityType;
  entity_id: string;
  kind: ActivityKind;
  title: string | null;
  body: string | null;
  owner_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  remind_at: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityCreateInput {
  entity_type: ActivityEntityType;
  entity_id: string;
  kind: ActivityKind;
  title?: string | null;
  body?: string | null;
  due_at?: string | null;
  remind_at?: string | null;
  owner_id?: string | null;
  completed_at?: string | null;
}

export interface ActivityUpdateInput {
  kind?: ActivityKind;
  title?: string | null;
  body?: string | null;
  due_at?: string | null;
  remind_at?: string | null;
  owner_id?: string | null;
  completed_at?: string | null;
}

export interface ActivityListQuery {
  entity_type?: ActivityEntityType;
  entity_id?: string;
  kind?: ActivityKind;
  owner_id?: string;
  completed?: boolean;
  due_from?: string;
  due_to?: string;
  page?: number;
  page_size?: number;
}

export interface ActivityListResponse {
  rows: ActivityDto[];
  total: number;
  page: number;
  page_size: number;
}

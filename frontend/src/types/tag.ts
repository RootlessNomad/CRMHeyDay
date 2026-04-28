export type TagKind = 'general' | 'vertical' | 'persona' | 'service_interest';
export type TaggableEntityType = 'company' | 'contact' | 'lead' | 'content_item';

export interface TagDto {
  id: string;
  name: string;
  color: string | null;
  kind: TagKind;
  created_at: string;
}

export interface TagCreateInput {
  name: string;
  color?: string;
  kind: TagKind;
}

export interface TagUpdateInput {
  name?: string;
  color?: string;
  kind?: TagKind;
}

export interface TagListQuery {
  q?: string;
  kind?: TagKind;
}

export interface TagAssignInput {
  tag_id: string;
  entity_type: TaggableEntityType;
  entity_id: string;
}

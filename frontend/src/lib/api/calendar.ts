import { z } from 'zod';

import { apiFetch } from './client';

export const calendarEventVisibilitySchema = z.enum(['personal', 'general']);
export const calendarEventFilterVisibilitySchema = z.enum(['personal', 'general', 'both']);
export const calendarRelatedEntityTypeSchema = z.enum(['lead', 'company', 'contact']);

const calendarEventDtoSchema = z.object({
  id: z.string().min(1),
  owner_id: z.string().min(1),
  created_by_id: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  location: z.string().nullable(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  all_day: z.boolean(),
  visibility: calendarEventVisibilitySchema,
  related_entity_type: calendarRelatedEntityTypeSchema.nullable(),
  related_entity_id: z.string().nullable(),
  color: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

const calendarEventListSchema = z.array(calendarEventDtoSchema);

export const calendarEventInputSchema = z
  .object({
    title: z.string().trim().min(1, { message: 'El título es obligatorio.' }).max(200),
    description: z.string().trim().max(5000).optional(),
    location: z.string().trim().max(500).optional(),
    startsAt: z.string().datetime({ message: 'La fecha de inicio no es válida.' }),
    endsAt: z.string().datetime({ message: 'La fecha de fin no es válida.' }),
    allDay: z.boolean(),
    visibility: calendarEventVisibilitySchema,
    relatedEntityType: calendarRelatedEntityTypeSchema.optional(),
    relatedEntityId: z.string().trim().min(1).optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, { message: 'El color no es válido.' })
      .optional(),
  })
  .superRefine((value, context) => {
    if (new Date(value.endsAt).getTime() < new Date(value.startsAt).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La fecha de fin debe ser posterior al inicio.',
        path: ['endsAt'],
      });
    }

    if (
      (value.relatedEntityType && !value.relatedEntityId) ||
      (!value.relatedEntityType && value.relatedEntityId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecciona una entidad válida.',
        path: ['relatedEntityId'],
      });
    }
  });

export type CalendarEventVisibility = z.infer<typeof calendarEventVisibilitySchema>;
export type CalendarFilterVisibility = z.infer<typeof calendarEventFilterVisibilitySchema>;
export type CalendarRelatedEntityType = z.infer<typeof calendarRelatedEntityTypeSchema>;

export interface CalendarEventDto {
  id: string;
  ownerId: string;
  createdById: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  visibility: CalendarEventVisibility;
  relatedEntityType: CalendarRelatedEntityType | null;
  relatedEntityId: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListCalendarEventsQuery {
  from: string;
  to: string;
  visibility?: CalendarFilterVisibility;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  visibility: CalendarEventVisibility;
  relatedEntityType?: CalendarRelatedEntityType;
  relatedEntityId?: string;
  color?: string;
}

export type CreateCalendarEventInput = CalendarEventInput;
export type UpdateCalendarEventInput = Partial<CalendarEventInput>;

function mapCalendarEvent(dto: z.infer<typeof calendarEventDtoSchema>): CalendarEventDto {
  return {
    id: dto.id,
    ownerId: dto.owner_id,
    createdById: dto.created_by_id,
    title: dto.title,
    description: dto.description,
    location: dto.location,
    startsAt: dto.starts_at,
    endsAt: dto.ends_at,
    allDay: dto.all_day,
    visibility: dto.visibility,
    relatedEntityType: dto.related_entity_type,
    relatedEntityId: dto.related_entity_id,
    color: dto.color,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function buildSearchParams(query: ListCalendarEventsQuery): string {
  const params = new URLSearchParams();

  params.set('from', query.from);
  params.set('to', query.to);
  params.set('visibility', query.visibility ?? 'both');

  return `?${params.toString()}`;
}

function serializeInput(
  input: CalendarEventInput | UpdateCalendarEventInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ('title' in input && input['title'] !== undefined) payload['title'] = input['title'];
  if ('description' in input) payload['description'] = input['description']?.trim() || undefined;
  if ('location' in input) payload['location'] = input['location']?.trim() || undefined;
  if ('startsAt' in input && input['startsAt'] !== undefined)
    payload['starts_at'] = input['startsAt'];
  if ('endsAt' in input && input['endsAt'] !== undefined) payload['ends_at'] = input['endsAt'];
  if ('allDay' in input && input['allDay'] !== undefined) payload['all_day'] = input['allDay'];
  if ('visibility' in input && input['visibility'] !== undefined)
    payload['visibility'] = input['visibility'];
  if ('relatedEntityType' in input)
    payload['related_entity_type'] = input['relatedEntityType'] ?? undefined;
  if ('relatedEntityId' in input)
    payload['related_entity_id'] = input['relatedEntityId']?.trim() || undefined;
  if ('color' in input) payload['color'] = input['color']?.trim() || undefined;

  return payload;
}

export async function listCalendarEvents(
  query: ListCalendarEventsQuery,
): Promise<CalendarEventDto[]> {
  const response = await apiFetch<unknown>(`/calendar/events${buildSearchParams(query)}`);
  return calendarEventListSchema.parse(response).map(mapCalendarEvent);
}

export async function createCalendarEvent(
  input: CreateCalendarEventInput,
): Promise<CalendarEventDto> {
  const response = await apiFetch<unknown>('/calendar/events', {
    method: 'POST',
    json: serializeInput(input),
  });
  return mapCalendarEvent(calendarEventDtoSchema.parse(response));
}

export async function updateCalendarEvent(
  id: string,
  patch: UpdateCalendarEventInput,
): Promise<CalendarEventDto> {
  const response = await apiFetch<unknown>(`/calendar/events/${id}`, {
    method: 'PATCH',
    json: serializeInput(patch),
  });
  return mapCalendarEvent(calendarEventDtoSchema.parse(response));
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  await apiFetch<void>(`/calendar/events/${id}`, { method: 'DELETE' });
}

import { z } from 'zod';

export const CalendarVisibilitySchema = z.enum(['personal', 'general']);
export const CalendarVisibilityFilterSchema = z.enum(['personal', 'general', 'both']);
export const CalendarRelatedEntityTypeSchema = z.enum(['lead', 'company', 'contact']);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const isoDatetimeSchema = z.string().datetime();
const calendarDateInputSchema = z.union([isoDatetimeSchema, isoDateSchema]);

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseCalendarEventInputDate(value: string, allDay: boolean): Date | null {
  if (allDay) {
    const datePart = value.slice(0, 10);
    if (!isDateOnly(datePart)) return null;
    return new Date(`${datePart}T00:00:00.000Z`);
  }

  if (isDateOnly(value)) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function validateCalendarDateRange(
  input: { starts_at: string; ends_at: string; all_day: boolean },
  ctx: z.RefinementCtx,
): void {
  const startsAt = parseCalendarEventInputDate(input.starts_at, input.all_day);
  const endsAt = parseCalendarEventInputDate(input.ends_at, input.all_day);

  if (!startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: input.all_day
        ? 'starts_at debe ser una fecha ISO válida'
        : 'starts_at debe ser un datetime ISO válido',
      path: ['starts_at'],
    });
  }

  if (!endsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: input.all_day
        ? 'ends_at debe ser una fecha ISO válida'
        : 'ends_at debe ser un datetime ISO válido',
      path: ['ends_at'],
    });
  }

  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ends_at debe ser mayor o igual que starts_at',
      path: ['ends_at'],
    });
  }
}

function validateRelatedEntityFields(
  input: { related_entity_type?: string | undefined; related_entity_id?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  const hasType = input.related_entity_type !== undefined;
  const hasId = input.related_entity_id !== undefined;

  if (hasType !== hasId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'related_entity_type y related_entity_id deben enviarse juntos',
      path: hasType ? ['related_entity_id'] : ['related_entity_type'],
    });
  }
}

const calendarWritableFields = {
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).optional(),
  location: z.string().max(200).optional(),
  starts_at: calendarDateInputSchema,
  ends_at: calendarDateInputSchema,
  all_day: z.boolean().default(false),
  visibility: CalendarVisibilitySchema,
  related_entity_type: CalendarRelatedEntityTypeSchema.optional(),
  related_entity_id: z.string().min(1).max(191).optional(),
  color: z.string().max(32).optional(),
};

export const CalendarEventCreateSchema = z
  .object(calendarWritableFields)
  .superRefine((input, ctx) => {
    validateRelatedEntityFields(input, ctx);
    validateCalendarDateRange(input, ctx);
  });

export const CalendarEventUpdateSchema = z
  .object({
    title: calendarWritableFields.title.optional(),
    description: calendarWritableFields.description,
    location: calendarWritableFields.location,
    starts_at: calendarWritableFields.starts_at.optional(),
    ends_at: calendarWritableFields.ends_at.optional(),
    all_day: calendarWritableFields.all_day.optional(),
    visibility: calendarWritableFields.visibility.optional(),
    related_entity_type: calendarWritableFields.related_entity_type,
    related_entity_id: calendarWritableFields.related_entity_id,
    color: calendarWritableFields.color,
  })
  .superRefine((input, ctx) => {
    validateRelatedEntityFields(input, ctx);
    if (input.starts_at !== undefined && input.ends_at !== undefined) {
      validateCalendarDateRange(
        {
          starts_at: input.starts_at,
          ends_at: input.ends_at,
          all_day: input.all_day ?? false,
        },
        ctx,
      );
    }
  });

export const CalendarEventListQuerySchema = z.object({
  from: isoDatetimeSchema,
  to: isoDatetimeSchema,
  visibility: CalendarVisibilityFilterSchema.default('both'),
});

export const CalendarEventDtoSchema = z.object({
  id: z.string(),
  owner_id: z.string().nullable(),
  created_by_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  all_day: z.boolean(),
  visibility: CalendarVisibilitySchema,
  related_entity_type: CalendarRelatedEntityTypeSchema.nullable(),
  related_entity_id: z.string().nullable(),
  color: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type CalendarEventCreateInput = z.infer<typeof CalendarEventCreateSchema>;
export type CalendarEventUpdateInput = z.infer<typeof CalendarEventUpdateSchema>;
export type CalendarEventListQuery = z.infer<typeof CalendarEventListQuerySchema>;
export type CalendarEventDto = z.infer<typeof CalendarEventDtoSchema>;

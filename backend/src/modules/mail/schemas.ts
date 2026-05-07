import { z } from 'zod';

const defaultImapHost = 'imap.hostinger.com';
const defaultImapPort = 993;
const defaultSmtpHost = 'smtp.hostinger.com';
const defaultSmtpPort = 465;

const emailAccountWritableFields = {
  password: z.string().min(1),
  display_name: z.string().min(1).optional(),
  imap_host: z.string().min(1).default(defaultImapHost),
  imap_port: z.number().int().positive().default(defaultImapPort),
  smtp_host: z.string().min(1).default(defaultSmtpHost),
  smtp_port: z.number().int().positive().default(defaultSmtpPort),
  signature_text: z.string().optional(),
  signature_html: z.string().optional(),
};

export const CreateEmailAccountInputSchema = z.object({
  email_address: z.string().email(),
  ...emailAccountWritableFields,
});

export const UpdateEmailAccountInputSchema = z.object({
  password: emailAccountWritableFields.password.optional(),
  display_name: emailAccountWritableFields.display_name,
  imap_host: emailAccountWritableFields.imap_host.optional(),
  imap_port: emailAccountWritableFields.imap_port.optional(),
  smtp_host: emailAccountWritableFields.smtp_host.optional(),
  smtp_port: emailAccountWritableFields.smtp_port.optional(),
  signature_text: emailAccountWritableFields.signature_text,
  signature_html: emailAccountWritableFields.signature_html,
});

export const ListMessagesQuerySchema = z.object({
  folder: z.string().min(1).default('INBOX'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});

export const SearchMessagesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  folder: z.string().min(1).default('INBOX'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

export const GetMessageQuerySchema = z.object({
  folder: z.string().min(1).default('INBOX'),
});

export const SetFlagsInputSchema = z.object({
  folder: z.string().min(1),
  seen: z.boolean().optional(),
  flagged: z.boolean().optional(),
});

export const SendEmailInputSchema = z.object({
  to: z.array(z.string().email()).min(1).max(50),
  cc: z.array(z.string().email()).max(50).default([]),
  bcc: z.array(z.string().email()).max(50).default([]),
  subject: z.string().trim().min(1).max(998),
  text: z.string().max(500_000).optional(),
  html: z.string().max(2_000_000).optional(),
  in_reply_to: z.string().optional(),
  references: z.string().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1).max(255),
        content_type: z.string().min(1),
        data: z.string().min(1),
      }),
    )
    .max(10)
    .default([]),
});

export const EmailToActivityInputSchema = z.object({
  folder: z.string().min(1),
  uid: z.number().int().positive(),
  entity_type: z.enum(['contact', 'lead', 'company']),
  entity_id: z.string().min(1),
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().max(10_000).optional(),
});

export const EmailAccountShareDtoSchema = z.object({
  user_id: z.string(),
});

export const EmailAccountPublicDtoSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  email_address: z.string().email(),
  display_name: z.string().nullable(),
  imap_host: z.string(),
  imap_port: z.number().int(),
  smtp_host: z.string(),
  smtp_port: z.number().int(),
  signature_text: z.string().nullable(),
  signature_html: z.string().nullable(),
  last_sync_at: z.string().datetime().nullable(),
  shares: z.array(EmailAccountShareDtoSchema),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const MessageAddressDtoSchema = z.object({
  name: z.string().nullable(),
  address: z.string().nullable(),
});

export const FolderDtoSchema = z.object({
  path: z.string(),
  name: z.string(),
  delimiter: z.string(),
  flags: z.array(z.string()),
});

export const MessageListItemDtoSchema = z.object({
  uid: z.number().int().positive(),
  message_id: z.string().nullable(),
  from: z.array(MessageAddressDtoSchema),
  to: z.array(MessageAddressDtoSchema),
  subject: z.string().nullable(),
  date: z.string().datetime().nullable(),
  flags: z.array(z.string()),
  has_attachments: z.boolean(),
  snippet: z.string(),
});

export const MessageListDtoSchema = z.object({
  folder: z.string(),
  page: z.number().int().min(1),
  page_size: z.number().int().min(1),
  total: z.number().int().min(0),
  messages: z.array(MessageListItemDtoSchema),
});

export const AttachmentDtoSchema = z.object({
  part_id: z.string(),
  filename: z.string().nullable(),
  size: z.number().int().min(0),
  content_type: z.string(),
});

export const MessageDetailDtoSchema = z.object({
  uid: z.number().int().positive(),
  message_id: z.string().nullable(),
  subject: z.string().nullable(),
  date: z.string().datetime().nullable(),
  from: z.array(MessageAddressDtoSchema),
  to: z.array(MessageAddressDtoSchema),
  cc: z.array(MessageAddressDtoSchema),
  bcc: z.array(MessageAddressDtoSchema),
  reply_to: z.array(MessageAddressDtoSchema),
  flags: z.array(z.string()),
  text: z.string().nullable(),
  html: z.string().nullable(),
  attachments: z.array(AttachmentDtoSchema),
});

export type CreateEmailAccountInput = z.infer<typeof CreateEmailAccountInputSchema>;
export type UpdateEmailAccountInput = z.infer<typeof UpdateEmailAccountInputSchema>;
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;
export type SearchMessagesQuery = z.infer<typeof SearchMessagesQuerySchema>;
export type GetMessageQuery = z.infer<typeof GetMessageQuerySchema>;
export type SetFlagsInput = z.infer<typeof SetFlagsInputSchema>;
export type SendEmailInput = z.infer<typeof SendEmailInputSchema>;
export type EmailToActivityInput = z.infer<typeof EmailToActivityInputSchema>;
export type EmailAccountPublicDto = z.infer<typeof EmailAccountPublicDtoSchema>;
export type FolderDto = z.infer<typeof FolderDtoSchema>;
export type MessageAddressDto = z.infer<typeof MessageAddressDtoSchema>;
export type MessageListItemDto = z.infer<typeof MessageListItemDtoSchema>;
export type MessageListDto = z.infer<typeof MessageListDtoSchema>;
export type AttachmentDto = z.infer<typeof AttachmentDtoSchema>;
export type MessageDetailDto = z.infer<typeof MessageDetailDtoSchema>;

import { z } from 'zod';

import { apiFetch } from './client';

const defaultImapHost = 'imap.hostinger.com';
const defaultImapPort = 993;
const defaultSmtpHost = 'smtp.hostinger.com';
const defaultSmtpPort = 465;

const createEmailAccountInputSchema = z.object({
  email_address: z.string().email(),
  password: z.string().min(1),
  display_name: z.string().min(1).optional(),
  imap_host: z.string().min(1).default(defaultImapHost),
  imap_port: z.number().int().positive().default(defaultImapPort),
  smtp_host: z.string().min(1).default(defaultSmtpHost),
  smtp_port: z.number().int().positive().default(defaultSmtpPort),
  signature_text: z.string().optional(),
  signature_html: z.string().optional(),
});

const updateEmailAccountInputSchema = z.object({
  password: z.string().min(1).optional(),
  display_name: z.string().min(1).optional(),
  imap_host: z.string().min(1).optional(),
  imap_port: z.number().int().positive().optional(),
  smtp_host: z.string().min(1).optional(),
  smtp_port: z.number().int().positive().optional(),
  signature_text: z.string().optional(),
  signature_html: z.string().optional(),
});

const messageAddressSchema = z.object({
  name: z.string().nullable(),
  address: z.string().nullable(),
});

const folderSchema = z.object({
  path: z.string(),
  name: z.string(),
  delimiter: z.string(),
  flags: z.array(z.string()),
});

const emailAccountShareSchema = z.object({
  user_id: z.string(),
});

const emailAccountSchema = z.object({
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
  shares: z.array(emailAccountShareSchema),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

const messageListItemSchema = z.object({
  uid: z.number().int().positive(),
  message_id: z.string().nullable(),
  from: z.array(messageAddressSchema),
  to: z.array(messageAddressSchema),
  subject: z.string().nullable(),
  date: z.string().datetime().nullable(),
  flags: z.array(z.string()),
  has_attachments: z.boolean(),
  snippet: z.string(),
});

const messageListSchema = z.object({
  folder: z.string(),
  page: z.number().int().min(1),
  page_size: z.number().int().min(1),
  total: z.number().int().min(0),
  messages: z.array(messageListItemSchema),
});

const attachmentSchema = z.object({
  part_id: z.string(),
  filename: z.string().nullable(),
  size: z.number().int().min(0),
  content_type: z.string(),
});

const messageDetailSchema = z.object({
  uid: z.number().int().positive(),
  message_id: z.string().nullable(),
  subject: z.string().nullable(),
  date: z.string().datetime().nullable(),
  from: z.array(messageAddressSchema),
  to: z.array(messageAddressSchema),
  cc: z.array(messageAddressSchema),
  bcc: z.array(messageAddressSchema),
  reply_to: z.array(messageAddressSchema),
  flags: z.array(z.string()),
  text: z.string().nullable(),
  html: z.string().nullable(),
  attachments: z.array(attachmentSchema),
});

const setFlagsInputSchema = z.object({
  folder: z.string().min(1),
  seen: z.boolean().optional(),
  flagged: z.boolean().optional(),
});

export interface EmailAccountDto {
  id: string;
  ownerId: string;
  emailAddress: string;
  displayName: string | null;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  signatureText: string | null;
  signatureHtml: string | null;
  lastSyncAt: string | null;
  shares: Array<{ userId: string }>;
  createdAt: string;
  updatedAt: string;
}

export type CreateEmailAccountInput = z.infer<typeof createEmailAccountInputSchema>;
export type UpdateEmailAccountInput = z.infer<typeof updateEmailAccountInputSchema>;

export interface FolderDto {
  path: string;
  name: string;
  delimiter: string;
  flags: string[];
}

export interface MessageAddressDto {
  name: string | null;
  address: string | null;
}

export interface MessageListItemDto {
  uid: number;
  messageId: string | null;
  from: MessageAddressDto[];
  to: MessageAddressDto[];
  subject: string | null;
  date: string | null;
  flags: string[];
  hasAttachments: boolean;
  snippet: string;
}

export interface MessageListDto {
  folder: string;
  page: number;
  pageSize: number;
  total: number;
  messages: MessageListItemDto[];
}

export interface AttachmentDto {
  partId: string;
  filename: string | null;
  size: number;
  contentType: string;
}

export interface MessageDetailDto {
  uid: number;
  messageId: string | null;
  subject: string | null;
  date: string | null;
  from: MessageAddressDto[];
  to: MessageAddressDto[];
  cc: MessageAddressDto[];
  bcc: MessageAddressDto[];
  replyTo: MessageAddressDto[];
  flags: string[];
  text: string | null;
  html: string | null;
  attachments: AttachmentDto[];
}

export interface SendEmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{
    filename: string;
    content_type: string;
    data: string;
  }>;
}

export interface SendEmailResult {
  messageId: string;
}

export function mapMessageAddress(input: unknown): MessageAddressDto {
  const parsed = messageAddressSchema.parse(input);
  return {
    name: parsed.name,
    address: parsed.address,
  };
}

export function mapFolder(input: unknown): FolderDto {
  const parsed = folderSchema.parse(input);
  return {
    path: parsed.path,
    name: parsed.name,
    delimiter: parsed.delimiter,
    flags: parsed.flags,
  };
}

export function mapAccount(input: unknown): EmailAccountDto {
  const parsed = emailAccountSchema.parse(input);
  return {
    id: parsed.id,
    ownerId: parsed.owner_id,
    emailAddress: parsed.email_address,
    displayName: parsed.display_name,
    imapHost: parsed.imap_host,
    imapPort: parsed.imap_port,
    smtpHost: parsed.smtp_host,
    smtpPort: parsed.smtp_port,
    signatureText: parsed.signature_text,
    signatureHtml: parsed.signature_html,
    lastSyncAt: parsed.last_sync_at,
    shares: parsed.shares.map((share) => ({ userId: share.user_id })),
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  };
}

export function mapMessageListItem(input: unknown): MessageListItemDto {
  const parsed = messageListItemSchema.parse(input);
  return {
    uid: parsed.uid,
    messageId: parsed.message_id,
    from: parsed.from.map(mapMessageAddress),
    to: parsed.to.map(mapMessageAddress),
    subject: parsed.subject,
    date: parsed.date,
    flags: parsed.flags,
    hasAttachments: parsed.has_attachments,
    snippet: parsed.snippet,
  };
}

export function mapMessageList(input: unknown): MessageListDto {
  const parsed = messageListSchema.parse(input);
  return {
    folder: parsed.folder,
    page: parsed.page,
    pageSize: parsed.page_size,
    total: parsed.total,
    messages: parsed.messages.map(mapMessageListItem),
  };
}

export function mapAttachment(input: unknown): AttachmentDto {
  const parsed = attachmentSchema.parse(input);
  return {
    partId: parsed.part_id,
    filename: parsed.filename,
    size: parsed.size,
    contentType: parsed.content_type,
  };
}

export function mapMessageDetail(input: unknown): MessageDetailDto {
  const parsed = messageDetailSchema.parse(input);
  return {
    uid: parsed.uid,
    messageId: parsed.message_id,
    subject: parsed.subject,
    date: parsed.date,
    from: parsed.from.map(mapMessageAddress),
    to: parsed.to.map(mapMessageAddress),
    cc: parsed.cc.map(mapMessageAddress),
    bcc: parsed.bcc.map(mapMessageAddress),
    replyTo: parsed.reply_to.map(mapMessageAddress),
    flags: parsed.flags,
    text: parsed.text,
    html: parsed.html,
    attachments: parsed.attachments.map(mapAttachment),
  };
}

export async function listAccounts(): Promise<EmailAccountDto[]> {
  const response = await apiFetch<unknown[]>('/mail/accounts');
  return z.array(z.unknown()).parse(response).map(mapAccount);
}

export async function createAccount(input: CreateEmailAccountInput): Promise<EmailAccountDto> {
  const payload = createEmailAccountInputSchema.parse(input);
  const response = await apiFetch<unknown>('/mail/accounts', { method: 'POST', json: payload });
  return mapAccount(response);
}

export async function updateAccount(
  id: string,
  input: UpdateEmailAccountInput,
): Promise<EmailAccountDto> {
  const payload = updateEmailAccountInputSchema.parse(input);
  const response = await apiFetch<unknown>(`/mail/accounts/${id}`, {
    method: 'PATCH',
    json: payload,
  });
  return mapAccount(response);
}

export async function deleteAccount(id: string): Promise<void> {
  await apiFetch<void>(`/mail/accounts/${id}`, { method: 'DELETE' });
}

export async function listFolders(accountId: string): Promise<FolderDto[]> {
  const response = await apiFetch<unknown[]>(`/mail/accounts/${accountId}/folders`);
  return z.array(z.unknown()).parse(response).map(mapFolder);
}

export async function listMessages(
  accountId: string,
  folder: string,
  page: number,
  pageSize: number,
): Promise<MessageListDto> {
  const params = new URLSearchParams({
    folder,
    page: String(page),
    page_size: String(pageSize),
  });
  const response = await apiFetch<unknown>(
    `/mail/accounts/${accountId}/messages?${params.toString()}`,
  );
  return mapMessageList(response);
}

export async function getMessage(
  accountId: string,
  uid: number,
  folder: string,
): Promise<MessageDetailDto> {
  const params = new URLSearchParams({ folder });
  const response = await apiFetch<unknown>(
    `/mail/accounts/${accountId}/messages/${uid}?${params.toString()}`,
  );
  return mapMessageDetail(response);
}

export async function setFlags(
  accountId: string,
  uid: number,
  input: { folder: string; seen?: boolean; flagged?: boolean },
): Promise<void> {
  const payload = setFlagsInputSchema.parse(input);
  await apiFetch<void>(`/mail/accounts/${accountId}/messages/${uid}/flags`, {
    method: 'PATCH',
    json: payload,
  });
}

export async function sendEmail(
  accountId: string,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const payload: Record<string, unknown> = {
    to: input.to,
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    subject: input.subject,
  };
  if (input.text !== undefined) payload['text'] = input.text;
  if (input.html !== undefined) payload['html'] = input.html;
  if (input.inReplyTo) payload['in_reply_to'] = input.inReplyTo;
  if (input.references) payload['references'] = input.references;
  if (input.attachments && input.attachments.length > 0) payload['attachments'] = input.attachments;

  return apiFetch<SendEmailResult>(`/mail/accounts/${accountId}/send`, {
    method: 'POST',
    json: payload,
  });
}

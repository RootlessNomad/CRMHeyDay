import type { EmailAccount, EmailAccountShare, Prisma, PrismaClient } from '@prisma/client';
import type { MessageAddressObject, MessageStructureObject } from 'imapflow';
import { ImapFlow } from 'imapflow';
import DOMPurify from 'isomorphic-dompurify';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { auditService, type AuditService } from '../audit/service.js';
import { credentialsService, type CredentialsService } from '../credentials/service.js';
import type {
  AttachmentDto,
  CreateEmailAccountInput,
  EmailAccountPublicDto,
  FolderDto,
  MessageAddressDto,
  MessageDetailDto,
  MessageListDto,
  UpdateEmailAccountInput,
} from './schemas.js';

class NotFoundError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'NotFoundError';
  }
}

class ForbiddenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ForbiddenError';
  }
}

class ImapConnectionError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ImapConnectionError';
  }
}

type EmailAccountRow = EmailAccount & {
  shares: EmailAccountShare[];
};

type MimeAttachment = {
  part_id: string;
  filename: string | null;
  size: number;
  content_type: string;
};

type ParsedMimeContent = {
  textParts: string[];
  htmlParts: string[];
  attachments: MimeAttachment[];
};

function toPublicDto(row: EmailAccountRow): EmailAccountPublicDto {
  return {
    id: row.id,
    owner_id: row.ownerId,
    email_address: row.emailAddress,
    display_name: row.displayName,
    imap_host: row.imapHost,
    imap_port: row.imapPort,
    smtp_host: row.smtpHost,
    smtp_port: row.smtpPort,
    signature_text: row.signatureText,
    signature_html: row.signatureHtml,
    last_sync_at: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    shares: row.shares.map((share) => ({ user_id: share.userId })),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function normalizeMailboxFlag(flag: string): string {
  return flag.trim();
}

function normalizeAddress(address: MessageAddressObject): MessageAddressDto {
  return {
    name: address.name ?? null,
    address: address.address ?? null,
  };
}

function toAddressList(addresses?: MessageAddressObject[]): MessageAddressDto[] {
  return (addresses ?? []).map(normalizeAddress);
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createSnippet(text: string | null, html: string | null): string {
  const raw = text?.trim() || (html ? stripHtml(html) : '');
  return raw.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function parseHeaders(rawHeaders: string): Map<string, string> {
  const headers = new Map<string, string>();
  const lines = rawHeaders.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentValue = '';

  const flush = () => {
    if (currentKey) headers.set(currentKey, currentValue.trim());
  };

  for (const line of lines) {
    if (/^\s/.test(line) && currentKey) {
      currentValue += ` ${line.trim()}`;
      continue;
    }

    flush();
    const idx = line.indexOf(':');
    if (idx === -1) {
      currentKey = null;
      currentValue = '';
      continue;
    }

    currentKey = line.slice(0, idx).trim().toLowerCase();
    currentValue = line.slice(idx + 1).trim();
  }

  flush();
  return headers;
}

function splitHeaderAndBody(raw: string): { headers: Map<string, string>; body: string } {
  const match = /\r?\n\r?\n/.exec(raw);
  if (!match) return { headers: new Map(), body: raw };
  const boundary = match.index;
  return {
    headers: parseHeaders(raw.slice(0, boundary)),
    body: raw.slice(boundary + match[0].length),
  };
}

function parseContentType(contentType: string | undefined): {
  mimeType: string;
  params: Record<string, string>;
} {
  if (!contentType) return { mimeType: 'text/plain', params: {} };
  const [mimeTypeRaw, ...parts] = contentType.split(';');
  const params: Record<string, string> = {};

  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part
      .slice(idx + 1)
      .trim()
      .replace(/^"|"$/g, '');
    params[key] = value;
  }

  return { mimeType: (mimeTypeRaw ?? 'text/plain').trim().toLowerCase(), params };
}

function decodeTransferEncoding(body: string, encoding: string | undefined): string {
  const normalized = (encoding ?? '').toLowerCase();
  if (normalized === 'base64') {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }

  if (normalized === 'quoted-printable') {
    return body
      .replace(/=(\r?\n)/g, '')
      .replace(/=([A-Fa-f0-9]{2})/g, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
  }

  return body;
}

function splitMultipartBody(body: string, boundary: string): string[] {
  const marker = `--${boundary}`;
  return body
    .split(marker)
    .slice(1)
    .map((part) =>
      part
        .replace(/^\r?\n/, '')
        .replace(/\r?\n--$/, '')
        .trim(),
    )
    .filter((part) => part.length > 0 && part !== '--');
}

function parseFilename(
  headers: Map<string, string>,
  contentTypeParams: Record<string, string>,
): string | null {
  const disposition = headers.get('content-disposition') ?? '';
  const dispositionFilename = /filename\*?=(?:"?)([^";]+)(?:"?)/i.exec(disposition)?.[1];
  return dispositionFilename ?? contentTypeParams['name'] ?? null;
}

function parseMime(raw: string, partId = '1'): ParsedMimeContent {
  const { headers, body } = splitHeaderAndBody(raw);
  const { mimeType, params } = parseContentType(headers.get('content-type'));
  const encoding = headers.get('content-transfer-encoding');
  const disposition = headers.get('content-disposition')?.toLowerCase() ?? '';

  if (mimeType.startsWith('multipart/') && params['boundary']) {
    const parts = splitMultipartBody(body, params['boundary']);
    return parts.reduce<ParsedMimeContent>(
      (acc, part, index) => {
        const child = parseMime(part, `${partId}.${index + 1}`);
        acc.textParts.push(...child.textParts);
        acc.htmlParts.push(...child.htmlParts);
        acc.attachments.push(...child.attachments);
        return acc;
      },
      { textParts: [], htmlParts: [], attachments: [] },
    );
  }

  if (mimeType === 'message/rfc822') {
    return parseMime(decodeTransferEncoding(body, encoding), `${partId}.1`);
  }

  const decoded = decodeTransferEncoding(body, encoding);
  const filename = parseFilename(headers, params);
  const isAttachment =
    disposition.includes('attachment') ||
    disposition.includes('inline') ||
    filename !== null ||
    !mimeType.startsWith('text/');

  if (mimeType === 'text/plain' && !isAttachment) {
    return { textParts: [decoded.trim()], htmlParts: [], attachments: [] };
  }

  if (mimeType === 'text/html' && !isAttachment) {
    return { textParts: [], htmlParts: [decoded.trim()], attachments: [] };
  }

  return {
    textParts: [],
    htmlParts: [],
    attachments: [
      {
        part_id: partId,
        filename,
        size: Buffer.byteLength(decoded),
        content_type: mimeType,
      },
    ],
  };
}

function collectStructureAttachments(
  node: MessageStructureObject | undefined,
  acc: AttachmentDto[] = [],
): AttachmentDto[] {
  if (!node) return acc;

  const contentType = node.type.toLowerCase();
  const filename = node.dispositionParameters?.['filename'] ?? node.parameters?.['name'] ?? null;
  const disposition = node.disposition?.toLowerCase() ?? '';
  const isAttachment =
    Boolean(node.part) &&
    (disposition === 'attachment' || disposition === 'inline' || filename !== null) &&
    !contentType.startsWith('multipart/');

  if (isAttachment && node.part) {
    acc.push({
      part_id: node.part,
      filename,
      size: node.size ?? 0,
      content_type: contentType,
    });
  }

  for (const child of node.childNodes ?? []) {
    collectStructureAttachments(child, acc);
  }

  return acc;
}

export class EmailAccountService {
  constructor(
    private db: PrismaClient = defaultPrisma,
    private audit: AuditService = auditService,
    private credentials: CredentialsService = credentialsService,
  ) {}

  async listForUser(userId: string): Promise<EmailAccountPublicDto[]> {
    const rows = await this.db.emailAccount.findMany({
      where: {
        OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
      },
      include: { shares: true },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toPublicDto);
  }

  async create(
    input: CreateEmailAccountInput,
    actorUserId: string,
  ): Promise<EmailAccountPublicDto> {
    const emailAddress = input.email_address.trim().toLowerCase();
    await imapService.testLogin(input.imap_host, input.imap_port, emailAddress, input.password);

    const credential = await this.credentials.create({
      key: `mail:${emailAddress}`,
      provider: 'email_imap',
      label: input.display_name?.trim() || emailAddress,
      plaintext: input.password,
      actorUserId,
    });

    const created = await this.db.emailAccount.create({
      data: {
        ownerId: actorUserId,
        emailAddress,
        displayName: input.display_name ?? null,
        imapHost: input.imap_host,
        imapPort: input.imap_port,
        smtpHost: input.smtp_host,
        smtpPort: input.smtp_port,
        credentialId: credential.id,
        signatureText: input.signature_text ?? null,
        signatureHtml: input.signature_html ?? null,
      },
      include: { shares: true },
    });

    await this.audit.record({
      action: 'email_account.created',
      actorUserId,
      entityType: 'email_account',
      entityId: created.id,
      metadata: {
        email_address: created.emailAddress,
        owner_id: created.ownerId,
      } satisfies Prisma.InputJsonValue,
    });

    return toPublicDto(created);
  }

  async update(
    id: string,
    input: UpdateEmailAccountInput,
    actorUserId: string,
  ): Promise<EmailAccountPublicDto> {
    const existing = await this.db.emailAccount.findUnique({
      where: { id },
      include: { shares: true, credential: { select: { key: true } } },
    });

    if (!existing) throw new NotFoundError(`Cuenta de email "${id}" no encontrada`);
    if (existing.ownerId !== actorUserId) {
      throw new ForbiddenError('No puedes modificar esta cuenta de email');
    }

    if (input.password) {
      await imapService.testLogin(
        input.imap_host ?? existing.imapHost,
        input.imap_port ?? existing.imapPort,
        existing.emailAddress,
        input.password,
      );

      await this.credentials.rotate({
        id: existing.credentialId,
        newPlaintext: input.password,
        actorUserId,
      });
    }

    const updated = await this.db.emailAccount.update({
      where: { id },
      data: {
        displayName: input.display_name ?? undefined,
        imapHost: input.imap_host,
        imapPort: input.imap_port,
        smtpHost: input.smtp_host,
        smtpPort: input.smtp_port,
        signatureText: input.signature_text ?? undefined,
        signatureHtml: input.signature_html ?? undefined,
      },
      include: { shares: true },
    });

    await this.audit.record({
      action: 'email_account.updated',
      actorUserId,
      entityType: 'email_account',
      entityId: updated.id,
      metadata: {
        email_address: updated.emailAddress,
      } satisfies Prisma.InputJsonValue,
    });

    return toPublicDto(updated);
  }

  async delete(id: string, actorUserId: string): Promise<void> {
    const existing = await this.db.emailAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError(`Cuenta de email "${id}" no encontrada`);
    if (existing.ownerId !== actorUserId) {
      throw new ForbiddenError('No puedes eliminar esta cuenta de email');
    }

    await this.db.emailAccount.delete({ where: { id } });
    await this.db.credential.delete({ where: { id: existing.credentialId } }).catch(() => {
      /* noop */
    });

    await this.audit.record({
      action: 'email_account.deleted',
      actorUserId,
      entityType: 'email_account',
      entityId: existing.id,
      metadata: {
        email_address: existing.emailAddress,
      } satisfies Prisma.InputJsonValue,
    });
  }

  async getAccessible(
    id: string,
    userId: string,
  ): Promise<{ account: EmailAccount; password: string }> {
    const existing = await this.db.emailAccount.findUnique({
      where: { id },
      include: { shares: true, credential: { select: { key: true } } },
    });

    if (!existing) throw new NotFoundError(`Cuenta de email "${id}" no encontrada`);

    if (existing.ownerId !== userId && !existing.shares.some((share) => share.userId === userId)) {
      throw new ForbiddenError('No tienes acceso a esta cuenta de email');
    }

    const password = await this.credentials.reveal(existing.credential.key);
    const { shares: _shares, credential: _credential, ...account } = existing;
    return { account, password };
  }
}

export class ImapService {
  private async withClient<T>(
    account: EmailAccount,
    password: string,
    fn: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: true,
      auth: {
        user: account.emailAddress,
        pass: password,
      },
      logger: false,
    });

    try {
      await client.connect();
      try {
        return await fn(client);
      } finally {
        await client.logout().catch(() => {
          /* noop */
        });
      }
    } catch (error) {
      throw new ImapConnectionError(
        error instanceof Error ? error.message : 'No se pudo conectar al servidor IMAP',
      );
    }
  }

  async testLogin(
    host: string,
    port: number,
    emailAddress: string,
    password: string,
  ): Promise<void> {
    const account = {
      imapHost: host,
      imapPort: port,
      emailAddress,
    } as EmailAccount;

    await this.withClient(account, password, async () => undefined);
  }

  async listFolders(account: EmailAccount, password: string): Promise<FolderDto[]> {
    return this.withClient(account, password, async (client) => {
      const folders = await client.list();
      return folders.map((folder) => ({
        path: folder.path,
        name: folder.name,
        delimiter: folder.delimiter,
        flags: [...folder.flags].map(normalizeMailboxFlag),
      }));
    });
  }

  async listMessages(
    account: EmailAccount,
    password: string,
    folder: string,
    page: number,
    pageSize: number,
  ): Promise<MessageListDto> {
    return this.withClient(account, password, async (client) => {
      const mailbox = await client.mailboxOpen(folder, { readOnly: true });
      const total = mailbox.exists;

      if (total === 0) {
        return { folder, page, page_size: pageSize, total: 0, messages: [] };
      }

      const start = total - (page - 1) * pageSize;
      if (start <= 0) {
        return { folder, page, page_size: pageSize, total, messages: [] };
      }

      const end = Math.max(1, start - pageSize + 1);
      const rows = [];
      for await (const message of client.fetch(
        `${end}:${start}`,
        {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
          source: { start: 0, maxLength: 8192 },
        },
        { uid: false },
      )) {
        rows.push(message);
      }

      rows.sort((a, b) => b.uid - a.uid);

      return {
        folder,
        page,
        page_size: pageSize,
        total,
        messages: rows.map((message) => {
          const source = message.source?.toString('utf8') ?? '';
          const parsed = source
            ? parseMime(source)
            : { textParts: [], htmlParts: [], attachments: [] };
          const text = parsed.textParts.join('\n\n').trim() || null;
          const html = parsed.htmlParts.join('\n\n').trim() || null;
          const structureAttachments = collectStructureAttachments(message.bodyStructure);

          return {
            uid: message.uid,
            message_id: message.envelope?.messageId ?? null,
            from: toAddressList(message.envelope?.from),
            to: toAddressList(message.envelope?.to),
            subject: message.envelope?.subject ?? null,
            date: message.envelope?.date ? message.envelope.date.toISOString() : null,
            flags: [...(message.flags ?? new Set<string>())],
            has_attachments: structureAttachments.length > 0 || parsed.attachments.length > 0,
            snippet: createSnippet(text, html),
          };
        }),
      };
    });
  }

  async getMessage(
    account: EmailAccount,
    password: string,
    folder: string,
    uid: number,
  ): Promise<MessageDetailDto> {
    return this.withClient(account, password, async (client) => {
      await client.mailboxOpen(folder, { readOnly: true });
      const message = await client.fetchOne(
        String(uid),
        {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
          source: true,
        },
        { uid: true },
      );

      if (!message) throw new NotFoundError(`Mensaje "${uid}" no encontrado`);

      const parsed = parseMime(message.source?.toString('utf8') ?? '');
      const rawHtml = parsed.htmlParts.join('\n\n').trim() || null;
      const sanitizedHtml = rawHtml
        ? DOMPurify.sanitize(rawHtml, {
            FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'src'],
            ADD_ATTR: ['target'],
          })
        : null;

      const attachments = collectStructureAttachments(message.bodyStructure);
      const mergedAttachments = attachments.length > 0 ? attachments : parsed.attachments;

      return {
        uid: message.uid,
        message_id: message.envelope?.messageId ?? null,
        subject: message.envelope?.subject ?? null,
        date: message.envelope?.date ? message.envelope.date.toISOString() : null,
        from: toAddressList(message.envelope?.from),
        to: toAddressList(message.envelope?.to),
        cc: toAddressList(message.envelope?.cc),
        bcc: toAddressList(message.envelope?.bcc),
        reply_to: toAddressList(message.envelope?.replyTo),
        flags: [...(message.flags ?? new Set<string>())],
        text: parsed.textParts.join('\n\n').trim() || null,
        html: sanitizedHtml,
        attachments: mergedAttachments,
      };
    });
  }

  async setFlags(
    account: EmailAccount,
    password: string,
    folder: string,
    uid: number,
    flags: { seen?: boolean; flagged?: boolean },
  ): Promise<void> {
    await this.withClient(account, password, async (client) => {
      await client.mailboxOpen(folder);

      if (flags.seen === true) await client.messageFlagsAdd([uid], ['\\Seen'], { uid: true });
      if (flags.seen === false) await client.messageFlagsRemove([uid], ['\\Seen'], { uid: true });
      if (flags.flagged === true) {
        await client.messageFlagsAdd([uid], ['\\Flagged'], { uid: true });
      }
      if (flags.flagged === false) {
        await client.messageFlagsRemove([uid], ['\\Flagged'], { uid: true });
      }
    });
  }
}

export const emailAccountService = new EmailAccountService();
export const imapService = new ImapService();
export { ForbiddenError, ImapConnectionError, NotFoundError };

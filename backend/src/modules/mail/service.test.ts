import type { EmailAccount, EmailAccountShare, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/service.js';
import type { CreateEmailAccountInput } from './schemas.js';
import {
  EmailAccountService,
  ForbiddenError,
  ImapConnectionError,
  NotFoundError,
  imapService,
} from './service.js';

vi.mock('imapflow', () => ({ ImapFlow: vi.fn() }));

interface FakeCredential {
  id: string;
  key: string;
  provider: string;
  label: string;
  plaintext: string;
}

interface FakeDb {
  emailAccounts: Map<string, EmailAccount>;
  shares: EmailAccountShare[];
  credentials: Map<string, FakeCredential>;
}

function buildFakeDb(): FakeDb {
  return {
    emailAccounts: new Map(),
    shares: [],
    credentials: new Map(),
  };
}

function makeEmailAccount(
  input: Partial<EmailAccount> & {
    id: string;
    ownerId: string;
    emailAddress: string;
    credentialId: string;
  },
): EmailAccount {
  const now = new Date();
  return {
    id: input.id,
    ownerId: input.ownerId,
    emailAddress: input.emailAddress,
    displayName: input.displayName ?? null,
    imapHost: input.imapHost ?? 'imap.hostinger.com',
    imapPort: input.imapPort ?? 993,
    smtpHost: input.smtpHost ?? 'smtp.hostinger.com',
    smtpPort: input.smtpPort ?? 465,
    credentialId: input.credentialId,
    signatureText: input.signatureText ?? null,
    signatureHtml: input.signatureHtml ?? null,
    lastSyncAt: input.lastSyncAt ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function makeShare(input: {
  emailAccountId: string;
  userId: string;
  createdAt?: Date;
}): EmailAccountShare {
  return {
    emailAccountId: input.emailAccountId,
    userId: input.userId,
    createdAt: input.createdAt ?? new Date(),
  };
}

function makePrismaMock(db: FakeDb): PrismaClient {
  return {
    emailAccount: {
      findMany: async ({
        where,
      }: {
        where: { OR: Array<{ ownerId: string } | { shares: { some: { userId: string } } }> };
      }) =>
        [...db.emailAccounts.values()]
          .filter((row) =>
            where.OR.some((clause) =>
              'ownerId' in clause
                ? row.ownerId === clause.ownerId
                : db.shares.some(
                    (share) =>
                      share.emailAccountId === row.id && share.userId === clause.shares.some.userId,
                  ),
            ),
          )
          .map((row) => ({
            ...row,
            shares: db.shares.filter((share) => share.emailAccountId === row.id),
          })),
      findUnique: async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: { shares?: true; credential?: { select: { key: true } } };
      }) => {
        const row = db.emailAccounts.get(where.id);
        if (!row) return null;
        return {
          ...row,
          ...(include?.shares
            ? { shares: db.shares.filter((share) => share.emailAccountId === row.id) }
            : {}),
          ...(include?.credential
            ? { credential: { key: db.credentials.get(row.credentialId)?.key ?? '' } }
            : {}),
        };
      },
      create: async ({
        data,
      }: {
        data: Omit<EmailAccount, 'id' | 'createdAt' | 'updatedAt' | 'lastSyncAt'> & {
          signatureText: string | null;
          signatureHtml: string | null;
        };
        include: { shares: true };
      }) => {
        const row = makeEmailAccount({
          id: `acct_${db.emailAccounts.size + 1}`,
          ownerId: data.ownerId,
          emailAddress: data.emailAddress,
          displayName: data.displayName,
          imapHost: data.imapHost,
          imapPort: data.imapPort,
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
          credentialId: data.credentialId,
          signatureText: data.signatureText,
          signatureHtml: data.signatureHtml,
        });
        db.emailAccounts.set(row.id, row);
        return { ...row, shares: [] };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<EmailAccount>;
        include: { shares: true };
      }) => {
        const existing = db.emailAccounts.get(where.id);
        if (!existing) throw new Error('missing email account');
        const updated = {
          ...existing,
          ...data,
          updatedAt: new Date(),
        };
        db.emailAccounts.set(where.id, updated);
        return {
          ...updated,
          shares: db.shares.filter((share) => share.emailAccountId === where.id),
        };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        db.emailAccounts.delete(where.id);
      },
    },
    credential: {
      delete: async ({ where }: { where: { id: string } }) => {
        db.credentials.delete(where.id);
      },
    },
  } as unknown as PrismaClient;
}

describe('EmailAccountService', () => {
  let db: FakeDb;
  let prisma: PrismaClient;
  let audit: { record: (entry: AuditEntry) => Promise<void> };
  let credentials: {
    create: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    reveal: ReturnType<typeof vi.fn>;
  };
  let service: EmailAccountService;

  beforeEach(() => {
    db = buildFakeDb();
    prisma = makePrismaMock(db);
    audit = { record: vi.fn(async () => undefined) };
    credentials = {
      create: vi.fn(async ({ key, provider, label, plaintext, actorUserId }) => {
        const credential = {
          id: `cred_${db.credentials.size + 1}`,
          key,
          provider,
          label,
          plaintext,
        };
        db.credentials.set(credential.id, credential);
        expect(actorUserId).toBeTruthy();
        return credential;
      }),
      rotate: vi.fn(async ({ id, newPlaintext }) => {
        const existing = db.credentials.get(id);
        if (!existing) throw new Error('missing credential');
        existing.plaintext = newPlaintext;
        return existing;
      }),
      reveal: vi.fn(async (key: string) => {
        const credential = [...db.credentials.values()].find((row) => row.key === key);
        if (!credential) throw new Error('missing credential');
        return credential.plaintext;
      }),
    };

    service = new EmailAccountService(prisma, audit as never, credentials as never);
    vi.spyOn(imapService, 'testLogin').mockResolvedValue(undefined);
  });

  it('listForUser returns own accounts', async () => {
    db.emailAccounts.set(
      'acct_1',
      makeEmailAccount({
        id: 'acct_1',
        ownerId: 'user_1',
        emailAddress: 'owner@test.com',
        credentialId: 'cred_1',
      }),
    );

    const result = await service.listForUser('user_1');

    expect(result).toHaveLength(1);
    expect(result[0]?.email_address).toBe('owner@test.com');
  });

  it('listForUser returns shared accounts', async () => {
    db.emailAccounts.set(
      'acct_1',
      makeEmailAccount({
        id: 'acct_1',
        ownerId: 'owner_1',
        emailAddress: 'shared@test.com',
        credentialId: 'cred_1',
      }),
    );
    db.shares.push(makeShare({ emailAccountId: 'acct_1', userId: 'user_1' }));

    const result = await service.listForUser('user_1');

    expect(result).toHaveLength(1);
    expect(result[0]?.shares).toEqual([{ user_id: 'user_1' }]);
  });

  it('listForUser does NOT return unrelated accounts', async () => {
    db.emailAccounts.set(
      'acct_1',
      makeEmailAccount({
        id: 'acct_1',
        ownerId: 'owner_1',
        emailAddress: 'other@test.com',
        credentialId: 'cred_1',
      }),
    );

    const result = await service.listForUser('user_1');

    expect(result).toEqual([]);
  });

  it('create persists and returns DTO when IMAP test passes', async () => {
    const input: CreateEmailAccountInput = {
      email_address: 'Owner@Test.com',
      password: 'secret',
      display_name: 'Owner',
      imap_host: 'imap.hostinger.com',
      imap_port: 993,
      smtp_host: 'smtp.hostinger.com',
      smtp_port: 465,
      signature_text: 'Regards',
      signature_html: '<p>Regards</p>',
    };

    const result = await service.create(input, 'user_1');

    expect(result.email_address).toBe('owner@test.com');
    expect(result).not.toHaveProperty('password');
    expect(db.emailAccounts.size).toBe(1);
  });

  it('create throws ImapConnectionError and does NOT persist on IMAP failure', async () => {
    vi.spyOn(imapService, 'testLogin').mockRejectedValue(new ImapConnectionError('bad login'));

    await expect(
      service.create(
        {
          email_address: 'owner@test.com',
          password: 'secret',
          display_name: 'Owner',
          imap_host: 'imap.hostinger.com',
          imap_port: 993,
          smtp_host: 'smtp.hostinger.com',
          smtp_port: 465,
        },
        'user_1',
      ),
    ).rejects.toBeInstanceOf(ImapConnectionError);

    expect(db.emailAccounts.size).toBe(0);
    expect(credentials.create).not.toHaveBeenCalled();
  });

  it('getAccessible returns account+password for owner', async () => {
    db.credentials.set('cred_1', {
      id: 'cred_1',
      key: 'mail:owner@test.com',
      provider: 'email_imap',
      label: 'owner@test.com',
      plaintext: 'secret',
    });
    db.emailAccounts.set(
      'acct_1',
      makeEmailAccount({
        id: 'acct_1',
        ownerId: 'user_1',
        emailAddress: 'owner@test.com',
        credentialId: 'cred_1',
      }),
    );

    const result = await service.getAccessible('acct_1', 'user_1');

    expect(result.account.emailAddress).toBe('owner@test.com');
    expect(result.password).toBe('secret');
  });

  it('getAccessible returns account+password for shared user', async () => {
    db.credentials.set('cred_1', {
      id: 'cred_1',
      key: 'mail:shared@test.com',
      provider: 'email_imap',
      label: 'shared@test.com',
      plaintext: 'secret',
    });
    db.emailAccounts.set(
      'acct_1',
      makeEmailAccount({
        id: 'acct_1',
        ownerId: 'owner_1',
        emailAddress: 'shared@test.com',
        credentialId: 'cred_1',
      }),
    );
    db.shares.push(makeShare({ emailAccountId: 'acct_1', userId: 'user_1' }));

    const result = await service.getAccessible('acct_1', 'user_1');

    expect(result.account.id).toBe('acct_1');
    expect(result.password).toBe('secret');
  });

  it('getAccessible throws ForbiddenError for unrelated user', async () => {
    db.credentials.set('cred_1', {
      id: 'cred_1',
      key: 'mail:private@test.com',
      provider: 'email_imap',
      label: 'private@test.com',
      plaintext: 'secret',
    });
    db.emailAccounts.set(
      'acct_1',
      makeEmailAccount({
        id: 'acct_1',
        ownerId: 'owner_1',
        emailAddress: 'private@test.com',
        credentialId: 'cred_1',
      }),
    );

    await expect(service.getAccessible('acct_1', 'user_1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('getAccessible throws NotFoundError for unknown id', async () => {
    await expect(service.getAccessible('missing', 'user_1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('delete removes account', async () => {
    db.credentials.set('cred_1', {
      id: 'cred_1',
      key: 'mail:owner@test.com',
      provider: 'email_imap',
      label: 'owner@test.com',
      plaintext: 'secret',
    });
    db.emailAccounts.set(
      'acct_1',
      makeEmailAccount({
        id: 'acct_1',
        ownerId: 'user_1',
        emailAddress: 'owner@test.com',
        credentialId: 'cred_1',
      }),
    );

    await service.delete('acct_1', 'user_1');

    expect(db.emailAccounts.has('acct_1')).toBe(false);
  });
});

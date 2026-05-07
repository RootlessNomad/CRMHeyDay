import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';

const ADMIN: PublicUserDto = {
  id: 'user_mail_admin',
  email: 'alex@heyday.test',
  name: 'Alex',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

const listForUser = vi.fn();
const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const getAccessible = vi.fn();
const listFolders = vi.fn();
const listMessages = vi.fn();
const getMessage = vi.fn();
const setFlags = vi.fn();

vi.mock('../../core/queue/connection.js', () => ({ redis: null }));

vi.mock('../../modules/auth/service.js', () => ({
  authService: {
    getUserForToken: vi.fn(async () => ADMIN),
  },
}));

vi.mock('../../modules/mail/index.js', () => {
  class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NotFoundError';
    }
  }

  class ForbiddenError extends Error {
    readonly statusCode = 403;

    constructor(message: string) {
      super(message);
      this.name = 'ForbiddenError';
    }
  }

  class ImapConnectionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ImapConnectionError';
    }
  }

  return {
    CreateEmailAccountInputSchema: {
      parse: (value: unknown) => value,
    },
    UpdateEmailAccountInputSchema: {
      parse: (value: unknown) => value,
    },
    ListMessagesQuerySchema: {
      parse: (value: unknown) => value,
    },
    GetMessageQuerySchema: {
      parse: (value: unknown) => value,
    },
    SetFlagsInputSchema: {
      parse: (value: unknown) => value,
    },
    emailAccountService: {
      listForUser,
      create,
      update,
      delete: remove,
      getAccessible,
    },
    imapService: {
      listFolders,
      listMessages,
      getMessage,
      setFlags,
    },
    NotFoundError,
    ForbiddenError,
    ImapConnectionError,
  };
});

interface SimpleInjectOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  payload?: string | object | Buffer | NodeJS.ReadableStream;
  headers?: Record<string, string>;
}

interface InjectResponse {
  statusCode: number;
  json: <T = unknown>() => T;
}

describe('mail routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const server = await import('../server.js');
    app = await server.buildApp({ disableRateLimit: true });
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_mail_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /mail/accounts returns 200 with accounts list', async () => {
    listForUser.mockResolvedValue([{ id: 'acct_1', email_address: 'owner@test.com', shares: [] }]);

    const res = await authInject(app, token, { method: 'GET', url: '/mail/accounts' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: [{ id: 'acct_1', email_address: 'owner@test.com', shares: [] }],
    });
  });

  it('POST /mail/accounts 201 on success', async () => {
    create.mockResolvedValue({ id: 'acct_1', email_address: 'owner@test.com', shares: [] });

    const res = await authInject(app, token, {
      method: 'POST',
      url: '/mail/accounts',
      payload: {
        email_address: 'owner@test.com',
        password: 'secret',
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('POST /mail/accounts 502 on ImapConnectionError', async () => {
    const { ImapConnectionError } = await import('../../modules/mail/index.js');
    create.mockRejectedValue(new ImapConnectionError('IMAP down'));

    const res = await authInject(app, token, {
      method: 'POST',
      url: '/mail/accounts',
      payload: {
        email_address: 'owner@test.com',
        password: 'secret',
      },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      error: { code: 'INTEGRATION_UNAVAILABLE', message: 'IMAP down' },
    });
  });

  it('POST /mail/accounts 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mail/accounts',
      payload: { email_address: 'owner@test.com', password: 'secret' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('PATCH /mail/accounts/:id 200 on success', async () => {
    update.mockResolvedValue({ id: 'acct_1', display_name: 'Updated' });

    const res = await authInject(app, token, {
      method: 'PATCH',
      url: '/mail/accounts/acct_1',
      payload: { display_name: 'Updated' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('PATCH /mail/accounts/:id 403 when ForbiddenError', async () => {
    const { ForbiddenError } = await import('../../modules/mail/index.js');
    update.mockRejectedValue(new ForbiddenError('Forbidden'));

    const res = await authInject(app, token, {
      method: 'PATCH',
      url: '/mail/accounts/acct_1',
      payload: { display_name: 'Updated' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('DELETE /mail/accounts/:id 200 on success', async () => {
    remove.mockResolvedValue(undefined);

    const res = await authInject(app, token, {
      method: 'DELETE',
      url: '/mail/accounts/acct_1',
    });

    expect(res.statusCode).toBe(200);
  });

  it('DELETE /mail/accounts/:id 403 when ForbiddenError', async () => {
    const { ForbiddenError } = await import('../../modules/mail/index.js');
    remove.mockRejectedValue(new ForbiddenError('Forbidden'));

    const res = await authInject(app, token, {
      method: 'DELETE',
      url: '/mail/accounts/acct_1',
    });

    expect(res.statusCode).toBe(403);
  });
});

async function authInject(
  app: FastifyInstance,
  token: string,
  options: SimpleInjectOptions,
): Promise<InjectResponse> {
  const res = await app.inject({
    ...options,
    headers: {
      ...options.headers,
      authorization: `Bearer ${token}`,
    },
  });
  return res as InjectResponse;
}

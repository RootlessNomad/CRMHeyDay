import { describe, expect, it } from 'vitest';

import {
  mapAccount,
  mapAttachment,
  mapFolder,
  mapMessageAddress,
  mapMessageDetail,
  mapMessageList,
  mapMessageListItem,
} from './mail';

describe('mail mappers', () => {
  it('mapAccount transforma snake_case a camelCase y conserva nulls', () => {
    const account = mapAccount({
      id: 'acc_1',
      owner_id: 'usr_1',
      email_address: 'ventas@heyday.test',
      display_name: null,
      imap_host: 'imap.hostinger.com',
      imap_port: 993,
      smtp_host: 'smtp.hostinger.com',
      smtp_port: 465,
      signature_text: null,
      signature_html: '<p>Firma</p>',
      last_sync_at: null,
      shares: [{ user_id: 'usr_2' }, { user_id: 'usr_3' }],
      created_at: '2026-01-02T03:04:05.000Z',
      updated_at: '2026-01-03T03:04:05.000Z',
    });

    expect(account.ownerId).toBe('usr_1');
    expect(account.emailAddress).toBe('ventas@heyday.test');
    expect(account.displayName).toBeNull();
    expect(account.signatureText).toBeNull();
    expect(account.signatureHtml).toBe('<p>Firma</p>');
    expect(account.lastSyncAt).toBeNull();
    expect(account.shares).toEqual([{ userId: 'usr_2' }, { userId: 'usr_3' }]);
  });

  it('mapMessageAddress mantiene valores null', () => {
    expect(mapMessageAddress({ name: null, address: 'ops@heyday.test' })).toEqual({
      name: null,
      address: 'ops@heyday.test',
    });
  });

  it('mapFolder conserva flags y metadata', () => {
    expect(
      mapFolder({
        path: 'INBOX/Clientes',
        name: 'Clientes',
        delimiter: '/',
        flags: ['\\HasNoChildren'],
      }),
    ).toEqual({
      path: 'INBOX/Clientes',
      name: 'Clientes',
      delimiter: '/',
      flags: ['\\HasNoChildren'],
    });
  });

  it('mapMessageListItem mapea arrays anidados y hasAttachments', () => {
    const item = mapMessageListItem({
      uid: 77,
      message_id: '<id-77>',
      from: [{ name: 'Alex', address: 'alex@heyday.test' }],
      to: [{ name: null, address: 'team@heyday.test' }],
      subject: 'Seguimiento',
      date: '2026-02-10T08:30:00.000Z',
      flags: ['\\Seen', '\\Flagged'],
      has_attachments: true,
      snippet: 'Resumen corto',
    });

    expect(item.messageId).toBe('<id-77>');
    expect(item.from[0]).toEqual({ name: 'Alex', address: 'alex@heyday.test' });
    expect(item.to[0]).toEqual({ name: null, address: 'team@heyday.test' });
    expect(item.flags).toEqual(['\\Seen', '\\Flagged']);
    expect(item.hasAttachments).toBe(true);
  });

  it('mapMessageList transforma page_size y messages', () => {
    const list = mapMessageList({
      folder: 'INBOX',
      page: 2,
      page_size: 50,
      total: 120,
      messages: [
        {
          uid: 1,
          message_id: null,
          from: [],
          to: [],
          subject: null,
          date: null,
          flags: [],
          has_attachments: false,
          snippet: '',
        },
      ],
    });

    expect(list.pageSize).toBe(50);
    expect(list.total).toBe(120);
    expect(list.messages[0]?.hasAttachments).toBe(false);
    expect(list.messages[0]?.messageId).toBeNull();
  });

  it('mapAttachment transforma part_id y content_type', () => {
    expect(
      mapAttachment({
        part_id: '2',
        filename: null,
        size: 2048,
        content_type: 'application/pdf',
      }),
    ).toEqual({
      partId: '2',
      filename: null,
      size: 2048,
      contentType: 'application/pdf',
    });
  });

  it('mapMessageDetail transforma reply_to y attachments', () => {
    const detail = mapMessageDetail({
      uid: 99,
      message_id: null,
      subject: null,
      date: null,
      from: [{ name: 'Ventas', address: 'ventas@heyday.test' }],
      to: [{ name: 'Cliente', address: 'cliente@test.com' }],
      cc: [],
      bcc: [],
      reply_to: [{ name: null, address: 'reply@heyday.test' }],
      flags: ['\\Seen'],
      text: 'Hola',
      html: null,
      attachments: [
        {
          part_id: '3',
          filename: 'propuesta.pdf',
          size: 4096,
          content_type: 'application/pdf',
        },
      ],
    });

    expect(detail.replyTo).toEqual([{ name: null, address: 'reply@heyday.test' }]);
    expect(detail.attachments[0]?.partId).toBe('3');
    expect(detail.attachments[0]?.filename).toBe('propuesta.pdf');
    expect(detail.text).toBe('Hola');
    expect(detail.html).toBeNull();
  });
});

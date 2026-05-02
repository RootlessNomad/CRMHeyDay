import { describe, expect, it, vi } from 'vitest';

import { scrapeWebsite, SsrfBlockedError } from './website.js';

describe('scrapeWebsite', () => {
  it('bloquea localhost por SSRF', async () => {
    await expect(scrapeWebsite('http://localhost:3000')).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('respeta robots.txt con Disallow /', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nDisallow: /', { status: 200 });
      }
      return new Response('<html></html>', { status: 200 });
    });

    const result = await scrapeWebsite('https://93.184.216.34', {
      fetch: fetchMock as typeof fetch,
    });

    expect(result.status).toBe('blocked');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mapea 404 a not_found', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/robots.txt'))
        return new Response('User-agent: *\nAllow: /', { status: 200 });
      return new Response('missing', { status: 404 });
    });

    const result = await scrapeWebsite('https://93.184.216.34/missing', {
      fetch: fetchMock as typeof fetch,
    });

    expect(result.status).toBe('not_found');
    expect(result.error).toContain('HTTP 404');
  });

  it('mapea 5xx a error', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/robots.txt'))
        return new Response('User-agent: *\nAllow: /', { status: 200 });
      return new Response('boom', { status: 503 });
    });

    const result = await scrapeWebsite('https://93.184.216.34/fail', {
      fetch: fetchMock as typeof fetch,
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('HTTP 503');
  });

  it('extrae texto y trunca a 30KB', async () => {
    const largeText = 'hola '.repeat(10_000);
    const html = `<html><head><style>.x{}</style></head><body><script>secret()</script><h1>Empresa</h1><p>${largeText}</p></body></html>`;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/robots.txt'))
        return new Response('User-agent: *\nAllow: /', { status: 200 });
      return new Response(html, { status: 200 });
    });

    const result = await scrapeWebsite('https://93.184.216.34/ok', {
      fetch: fetchMock as typeof fetch,
    });

    expect(result.status).toBe('ok');
    expect(result.textContent).toContain('Empresa');
    expect(result.textContent).not.toContain('secret()');
    expect((result.textContent?.length ?? 0) <= 30 * 1024).toBe(true);
    expect((result.excerpt?.length ?? 0) <= 4 * 1024).toBe(true);
  });

  it('devuelve error por timeout', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/robots.txt'))
        return Promise.resolve(new Response('User-agent: *\nAllow: /'));
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });

    vi.useFakeTimers();
    const promise = scrapeWebsite('https://93.184.216.34/slow', {
      fetch: fetchMock as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(15_100);
    const result = await promise;
    vi.useRealTimers();

    expect(result.status).toBe('error');
    expect(result.error).toContain('timed out');
  });
});

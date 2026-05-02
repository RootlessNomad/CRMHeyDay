import { load } from 'cheerio';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export interface ScrapeResult {
  url: string;
  finalUrl: string;
  status: 'ok' | 'blocked' | 'not_found' | 'error';
  html?: string;
  textContent?: string;
  excerpt?: string;
  error?: string;
  fetchedAt: string;
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

export interface ScrapeWebsiteDeps {
  fetch?: typeof fetch;
  now?: () => Date;
}

const USER_AGENT = 'HeyDayCRM/1.0 (+https://heyday.es/bot)';
const TIMEOUT_MS = 15_000;
const MAX_TEXT_LENGTH = 30 * 1024;
const MAX_EXCERPT_LENGTH = 4 * 1024;

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return false;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
}

function assertSafeParsedUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError('URL inválida');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new SsrfBlockedError('Solo se permiten URLs http/https');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost') {
    throw new SsrfBlockedError('SSRF blocked for localhost');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
      throw new SsrfBlockedError('SSRF blocked for private IP');
    }
  }

  return parsed;
}

async function assertSafeHostname(url: URL): Promise<void> {
  const resolved = await lookup(url.hostname, { all: true });
  for (const entry of resolved) {
    if (entry.family === 4 && isPrivateIpv4(entry.address)) {
      throw new SsrfBlockedError(`SSRF blocked for private IP ${entry.address}`);
    }
    if (entry.family === 6 && isPrivateIpv6(entry.address)) {
      throw new SsrfBlockedError(`SSRF blocked for private IP ${entry.address}`);
    }
  }
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function extractTextContent(html: string): string {
  const $ = load(html);
  $('script, style, noscript').remove();
  return normalizeWhitespace($.root().text()).slice(0, MAX_TEXT_LENGTH);
}

function robotsDisallowsAll(body: string): boolean {
  const lines = body.split(/\r?\n/);
  let applies = false;
  let disallowRoot = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === 'user-agent') {
      applies = value === '*' || value.toLowerCase() === 'heydaycrm';
      continue;
    }

    if (applies && key === 'disallow' && value === '/') {
      disallowRoot = true;
    }
  }

  return disallowRoot;
}

function toFetchedAt(now: () => Date): string {
  return now().toISOString();
}

export async function scrapeWebsite(
  rawUrl: string,
  deps: ScrapeWebsiteDeps = {},
): Promise<ScrapeResult> {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  const parsedUrl = assertSafeParsedUrl(rawUrl);
  await assertSafeHostname(parsedUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers = { 'user-agent': USER_AGENT };
    const robotsUrl = new URL('/robots.txt', parsedUrl.origin);
    const robotsResponse = await fetchImpl(robotsUrl.toString(), {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (robotsResponse.ok) {
      const robotsBody = await robotsResponse.text();
      if (robotsDisallowsAll(robotsBody)) {
        return {
          url: rawUrl,
          finalUrl: rawUrl,
          status: 'blocked',
          error: 'Blocked by robots.txt',
          fetchedAt: toFetchedAt(now),
        };
      }
    }

    const response = await fetchImpl(parsedUrl.toString(), {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    const finalUrl = response.url || parsedUrl.toString();
    const fetchedAt = toFetchedAt(now);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          url: rawUrl,
          finalUrl,
          status: 'blocked',
          error: `HTTP ${response.status}`,
          fetchedAt,
        };
      }
      if (response.status >= 400 && response.status < 500) {
        return {
          url: rawUrl,
          finalUrl,
          status: 'not_found',
          error: `HTTP ${response.status}`,
          fetchedAt,
        };
      }

      return {
        url: rawUrl,
        finalUrl,
        status: 'error',
        error: `HTTP ${response.status}`,
        fetchedAt,
      };
    }

    const html = await response.text();
    return {
      url: rawUrl,
      finalUrl,
      status: 'ok',
      html,
      textContent: extractTextContent(html),
      excerpt: html.slice(0, MAX_EXCERPT_LENGTH),
      fetchedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const aborted = controller.signal.aborted || message.toLowerCase().includes('abort');
    return {
      url: rawUrl,
      finalUrl: parsedUrl.toString(),
      status: 'error',
      error: aborted ? 'Request timed out' : message,
      fetchedAt: toFetchedAt(now),
    };
  } finally {
    clearTimeout(timer);
  }
}

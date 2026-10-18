import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './src/main.server';
import { KPB_CSP_NONCE, KPB_PUBLIC_SITE_URL, KPB_REQUEST_HEADERS } from './src/app/contracts/runtime-tokens';

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml = join(serverDistFolder, 'index.server.html');

  const commonEngine = new CommonEngine();

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  server.use((req, res, next) => {
    const nonce = randomBytes(16).toString('base64url');
    res.locals['cspNonce'] = nonce;
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });

  server.get('/robots.txt', async (_req, res) => {
    const content = await seoText('/seo/robots', `User-agent: *\nAllow: /\nSitemap: ${siteUrl()}/sitemap.xml\n`);
    res.type('text/plain').setHeader('Cache-Control', 'public, max-age=300');
    res.send(content);
  });

  server.get('/sitemap.xml', async (_req, res) => {
    const content = await seoSitemap();
    res.type('application/xml').setHeader('Cache-Control', 'public, max-age=300');
    res.send(content);
  });

  server.get('/feed/products', async (_req, res) => {
    const content = await seoText('/seo/feed/products', '[]');
    res.type(content.trim().startsWith('<') ? 'application/xml' : 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(content);
  });

  // Serve static files from /browser
  server.get('**', express.static(browserDistFolder, {
    maxAge: '1y',
    index: 'index.html',
  }));

  // All regular routes use the Angular engine
  server.get('**', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    commonEngine
      .render({
        bootstrap,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: browserDistFolder,
        providers: [
          { provide: APP_BASE_HREF, useValue: baseUrl },
          { provide: KPB_CSP_NONCE, useValue: res.locals['cspNonce'] as string },
          { provide: KPB_PUBLIC_SITE_URL, useValue: siteUrl() },
          { provide: KPB_REQUEST_HEADERS, useValue: headers },
        ],
      })
      .then((html) => res.send(injectRuntimeMeta(html, res.locals['cspNonce'] as string)))
      .catch((err) => next(err));
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

run();

async function seoText(path: string, fallback: string): Promise<string> {
  try {
    const response = await fetch(`${apiOrigin()}/api/v1${path}`, { headers: { Accept: 'application/json, text/plain, application/xml' } });
    if (!response.ok) return fallback;
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const data = record(parsed['data'] ?? parsed);
      const robots = data['robots'] ?? parsed['robots'];
      if (Array.isArray(robots)) return `${robots.map(String).join('\n')}\n`;
      return stringValue(data['content'] ?? data['feed'] ?? data['robots'] ?? parsed['content'] ?? parsed['feed'] ?? text);
    } catch {
      return text;
    }
  } catch {
    return fallback;
  }
}

async function seoSitemap(): Promise<string> {
  const fallback = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${xml(absoluteUrl('/th'))}</loc>`,
    '  </url>',
    '  <url>',
    `    <loc>${xml(absoluteUrl('/en'))}</loc>`,
    '  </url>',
    '</urlset>',
  ].join('\n');
  const text = await seoText('/seo/sitemap', fallback);
  if (text.trim().startsWith('<')) return text;
  try {
    const parsed = JSON.parse(text) as unknown;
    const parsedRecord = record(parsed);
    const data = record(parsedRecord['data'] ?? parsedRecord);
    const entries = Array.isArray(parsed)
      ? parsed
      : arrayValue(data['entries'] ?? data['routes'] ?? parsedRecord['entries'] ?? parsedRecord['routes']);
    const urls = entries
      .map((entry) => sitemapEntry(entry))
      .filter((entry): entry is SitemapEntry => Boolean(entry))
      .map((entry) => {
        const alternates = entry.alternates
          .map((alternate) => `    <xhtml:link rel="alternate" hreflang="${xml(alternate.hreflang)}" href="${xml(alternate.href)}" />`)
          .join('\n');
        return [
          '  <url>',
          `    <loc>${xml(entry.loc)}</loc>`,
          entry.lastmod ? `    <lastmod>${xml(entry.lastmod)}</lastmod>` : '',
          alternates,
          '  </url>',
        ].filter(Boolean).join('\n');
      })
      .join('\n');
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
      urls,
      '</urlset>',
    ].join('\n');
  } catch {
    return fallback;
  }
}

function apiOrigin(): string {
  return process.env['KPB_API_ORIGIN'] ?? 'http://127.0.0.1:8088';
}

function siteUrl(): string {
  return (process.env['PUBLIC_SITE_URL'] ?? process.env['SITE_URL'] ?? process.env['KPB_SITE_URL'] ?? 'https://khunphorbaan.com').replace(/\/+$/, '');
}

function sitemapEntry(value: unknown): SitemapEntry | null {
  const entry = record(value);
  const rawLoc = stringValue(entry['canonical'] ?? entry['canonical_url'] ?? entry['loc'] ?? entry['url'] ?? entry['route']);
  if (!rawLoc) return null;
  const loc = absoluteUrl(rawLoc);
  const rawLastmod = stringValue(entry['lastmod'] ?? entry['updated_at']);
  const date = rawLastmod ? new Date(rawLastmod) : null;
  return {
    loc,
    lastmod: date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : undefined,
    alternates: sitemapAlternates(entry),
  };
}

function sitemapAlternates(entry: Record<string, unknown>): SitemapAlternate[] {
  const alternates = alternatesValue(entry['alternates'] ?? entry['alternate_urls']);
  for (const locale of ['th', 'en']) {
    const href = stringValue(entry[`alternate_${locale}`] ?? entry[`${locale}_url`]);
    if (href) alternates.push({ hreflang: locale, href: absoluteUrl(href) });
  }
  const unique = new Map<string, SitemapAlternate>();
  for (const alternate of alternates) {
    if (!alternate.hreflang || !alternate.href) continue;
    unique.set(alternate.hreflang, alternate);
  }
  return Array.from(unique.values());
}

function alternatesValue(value: unknown): SitemapAlternate[] {
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      return alternatesValue(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  return arrayValue(value).flatMap((item) => {
    const alternate = record(item);
    const hreflang = stringValue(alternate['hreflang'] ?? alternate['locale']);
    const href = stringValue(alternate['href'] ?? alternate['url'] ?? alternate['loc']);
    return hreflang && href ? [{ hreflang, href: absoluteUrl(href) }] : [];
  });
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, `${siteUrl()}/`).toString();
  } catch {
    return /^https?:\/\//.test(value) ? value : `${siteUrl()}${value.startsWith('/') ? value : `/${value}`}`;
  }
}

function injectRuntimeMeta(html: string, nonce: string): string {
  const escapedNonce = xml(nonce);
  return html
    .replace(/nonce-\{NONCE\}/g, `nonce-${escapedNonce}`)
    .replace(
      /<link rel="stylesheet" href="([^"]+)" media="print" onload="this\.media='all'">/g,
      '<link rel="stylesheet" href="$1">',
    )
    .replace(/<style(?![^>]*\bnonce=)/g, `<style nonce="${escapedNonce}"`)
    .replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${escapedNonce}"`)
    .replace(
      '<head>',
      `<head><meta name="csp-nonce" content="${escapedNonce}"><meta name="kpb-public-site-url" content="${xml(siteUrl())}">`,
    );
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  alternates: SitemapAlternate[];
}

interface SitemapAlternate {
  hreflang: string;
  href: string;
}

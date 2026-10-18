import { Injectable } from '@angular/core';
import type { SeoSitemapEntry } from '../../contracts/api-contract';

@Injectable({ providedIn: 'root' })
export class SitemapBuilder {
  public readonly version = '1.0.0';

  toXml(entries: SeoSitemapEntry[]): string {
    const urls = entries.map((entry) => {
      const alternates = (entry.alternates ?? [])
        .filter((alternate) => Boolean(alternate.hreflang ?? alternate.locale))
        .map((alternate) => `<xhtml:link rel="alternate" hreflang="${this.escape(alternate.hreflang ?? alternate.locale ?? '')}" href="${this.escape(alternate.href)}" />`)
        .join('');
      return [
        '<url>',
        `<loc>${this.escape(entry.loc)}</loc>`,
        entry.lastmod ? `<lastmod>${this.escape(entry.lastmod)}</lastmod>` : '',
        entry.changefreq ? `<changefreq>${this.escape(entry.changefreq)}</changefreq>` : '',
        typeof entry.priority === 'number' ? `<priority>${entry.priority.toFixed(1)}</priority>` : '',
        alternates,
        '</url>',
      ].join('');
    }).join('');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
      urls,
      '</urlset>',
    ].join('');
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

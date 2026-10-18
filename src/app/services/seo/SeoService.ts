import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ApiClient } from '../../modules/http-client/ApiClient';
import { CspNonceProvider } from '../../modules/csp-helper/CspNonceProvider';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import { JsonLdBuilder } from '../../modules/jsonld/JsonLdBuilder';
import { SeoUrlBuilder } from '../../modules/seo-url/SeoUrlBuilder';
import type { SeoSitemapEntry } from '../../contracts/api-contract';

export interface SeoPageOptions {
  title: string;
  description: string;
  path?: string;
  image?: string;
  noindex?: boolean;
  robots?: string;
  jsonLd?: unknown[];
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  public readonly version = '1.1.0';
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly api = inject(ApiClient);
  private readonly nonce = inject(CspNonceProvider);
  private readonly i18n = inject(I18nLoader);
  private readonly jsonLd = inject(JsonLdBuilder);
  private readonly urls = inject(SeoUrlBuilder);
  private readonly defaultOgImageUrl = this.urls.publicAssetUrl('assets/og-default.png') ?? '';

  private readonly ALLOWED_OG_IMAGE_HOSTS = new Set([
    'cdn.khunphorbaan.com',
    'media.khunphorbaan.com',
  ]);

  setPage(options: SeoPageOptions): void {
    const locale = this.i18n.currentLocale();
    const canonical = this.urls.absolutePath(options.path ?? `/${locale}`);
    const fullTitle = options.title.includes('KhunPhorBaan') ? options.title : `${options.title} | KhunPhorBaan`;
    const image = this.urls.publicAssetUrl(options.image);
    this.title.setTitle(fullTitle);
    this.meta.updateTag({ name: 'description', content: options.description });
    const robots = options.robots ?? (options.noindex ? 'noindex, nofollow' : 'index, follow');
    this.meta.updateTag({ name: 'robots', content: robots });
    this.meta.updateTag({ name: 'googlebot', content: robots });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: options.description });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: options.description });
    if (image) {
      const safeImage = this.validateOgImageUrl(image);
      this.meta.updateTag({ property: 'og:image', content: safeImage });
      this.meta.updateTag({ name: 'twitter:image', content: safeImage });
    }
    this.link('canonical', canonical);
    this.hreflang(options.path ?? `/${locale}`);
    this.setJsonLd([
      this.jsonLd.organization(),
      this.jsonLd.website(locale),
      ...(options.jsonLd ?? []),
    ]);
  }

  robots(): Promise<unknown> {
    return this.api.get('/seo/robots');
  }

  sitemap(): Promise<{ entries: SeoSitemapEntry[] } | SeoSitemapEntry[]> {
    return this.api.get('/seo/sitemap');
  }

  productFeed(): Promise<unknown> {
    return this.api.get('/seo/feed/products');
  }

  private link(rel: string, href: string): void {
    let element = this.doc.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!element) {
      element = this.doc.createElement('link');
      element.rel = rel;
      this.doc.head.appendChild(element);
    }
    element.href = href;
  }

  private hreflang(path: string): void {
    this.doc.querySelectorAll('link[rel="alternate"][hreflang]').forEach((node) => node.remove());
    for (const locale of ['th', 'en']) {
      const link = this.doc.createElement('link');
      link.rel = 'alternate';
      link.hreflang = locale;
      link.href = this.urls.absolutePath(path.replace(/^\/(th|en)/, `/${locale}`));
      this.doc.head.appendChild(link);
    }
  }

  private setJsonLd(data: unknown[]): void {
    this.doc.querySelectorAll('script[type="application/ld+json"][data-kpb-jsonld]').forEach((node) => node.remove());
    const script = this.doc.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-kpb-jsonld', 'true');
    const nonce = this.nonce.getNonce();
    if (nonce) script.setAttribute('nonce', nonce);
    script.textContent = JSON.stringify(data);
    this.doc.head.appendChild(script);
  }

  private validateOgImageUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (!this.ALLOWED_OG_IMAGE_HOSTS.has(parsed.hostname)) {
        return this.defaultOgImageUrl;
      }
      return url;
    } catch {
      return this.defaultOgImageUrl;
    }
  }
}

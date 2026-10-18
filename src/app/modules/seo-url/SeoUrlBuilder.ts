import { inject, Injectable } from '@angular/core';
import { KPB_PUBLIC_SITE_URL } from '../../contracts/runtime-tokens';

@Injectable({ providedIn: 'root' })
export class SeoUrlBuilder {
  public readonly version = '1.0.1';
  private readonly publicSiteUrl = inject(KPB_PUBLIC_SITE_URL).replace(/\/+$/, '');
  private readonly cdnAllowlist: string[] = this.envList('KPB_CDN_HOSTS');

  siteUrl(): string {
    return this.publicSiteUrl;
  }

  absolutePath(path: string): string {
    return this.absoluteUrl(path.startsWith('/') ? path : `/${path}`);
  }

  absoluteUrl(value: string): string {
    try {
      return new URL(value, `${this.publicSiteUrl}/`).toString();
    } catch {
      return `${this.publicSiteUrl}${value.startsWith('/') ? value : `/${value}`}`;
    }
  }

  publicAssetUrl(value: string | undefined | null): string | undefined {
    if (!value) return undefined;
    const raw = value.trim();
    const absoluteInput = /^https?:\/\//i.test(raw);
    const absolute = this.absoluteUrl(value);
    try {
      const url = new URL(absolute);
      if (this.isLocalhost(url.hostname)) {
        return this.absoluteUrl(`${url.pathname}${url.search}${url.hash}`);
      }
      const siteHost = new URL(this.absoluteUrl('/')).hostname;
      if (absoluteInput && url.hostname !== siteHost) {
        const allowed = this.cdnAllowlist.length === 0 ? [siteHost] : this.cdnAllowlist;
        if (!allowed.some((host) => url.hostname === host)) {
          console.warn('[seo] non-allowlisted image host rejected:', url.hostname);
          return undefined;
        }
      }
      return url.toString();
    } catch {
      return absolute;
    }
  }

  private isLocalhost(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  private envList(name: string): string[] {
    const processRef = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    return String(processRef?.env?.[name] ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  }
}
